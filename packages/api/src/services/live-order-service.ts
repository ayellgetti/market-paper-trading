import type { Order, PrismaClient } from '@paper-trading/db';
import type { BrokerOrder } from '@paper-trading/broker-adapters';
import { BrokerService } from './broker-service.js';
import { AuditService } from './audit-service.js';
import type { FastifyRequest } from 'fastify';

export interface LivePlaceOrderInput {
  userId: string;
  paperAccountId: string;
  instrumentId: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  productType: 'CNC' | 'MIS' | 'NRML';
  quantity: number;
  price?: number;
  ltp?: number;
}

export class LiveOrderService {
  private brokerService: BrokerService;
  private auditService: AuditService;

  constructor(private db: PrismaClient) {
    this.brokerService = new BrokerService(db);
    this.auditService = new AuditService(db);
  }

  async placeOrder(input: LivePlaceOrderInput, request?: FastifyRequest): Promise<Order> {
    const instrument = await this.db.instrument.findFirstOrThrow({
      where: { id: input.instrumentId },
    });

    if (!instrument.brokerToken && instrument.segment === 'EQUITY') {
      // equity mock uses symbol as token
    }

    const adapter = await this.brokerService.getLiveAdapter(input.userId);

    if (!adapter.placeOrder) {
      throw new Error('Broker adapter does not support live orders');
    }

    const brokerOrder: BrokerOrder = {
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      side: input.side,
      orderType: input.orderType,
      productType: input.productType,
      quantity: input.quantity,
      price: input.price,
    };

    const order = await this.db.order.create({
      data: {
        userId: input.userId,
        paperAccountId: input.paperAccountId,
        instrumentId: input.instrumentId,
        mode: 'LIVE',
        side: input.side,
        orderType: input.orderType,
        productType: input.productType,
        quantity: input.quantity,
        price: input.price,
        status: 'PENDING',
      },
    });

    try {
      const response = await adapter.placeOrder(brokerOrder);
      const filledQty = response.filledQuantity ?? 0;
      const avgPrice = response.averagePrice ?? input.ltp ?? input.price ?? 0;
      const isComplete = response.status === 'COMPLETE' || filledQty > 0;

      const updated = await this.db.order.update({
        where: { id: order.id },
        data: {
          brokerOrderId: response.brokerOrderId,
          status: isComplete ? 'COMPLETE' : 'OPEN',
          filledQuantity: filledQty || (isComplete ? input.quantity : 0),
          averagePrice: avgPrice || undefined,
          rejectionReason: response.message,
        },
      });

      if (isComplete && avgPrice > 0) {
        await this.db.trade.create({
          data: {
            orderId: order.id,
            quantity: filledQty || input.quantity,
            price: avgPrice,
          },
        });
      }

      await this.auditService.log(
        input.userId,
        'LIVE_ORDER_PLACED',
        'order',
        order.id,
        {
          brokerOrderId: response.brokerOrderId,
          symbol: instrument.symbol,
          side: input.side,
          quantity: input.quantity,
          status: updated.status,
          simulated: response.message?.includes('Simulated'),
        },
        request,
      );

      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Live order failed';
      await this.db.order.update({
        where: { id: order.id },
        data: { status: 'REJECTED', rejectionReason: message },
      });
      await this.auditService.log(
        input.userId,
        'LIVE_ORDER_REJECTED',
        'order',
        order.id,
        { error: message },
        request,
      );
      throw err;
    }
  }

  async cancelOrder(userId: string, orderId: string, request?: FastifyRequest): Promise<Order> {
    const order = await this.db.order.findFirst({
      where: { id: orderId, userId, mode: 'LIVE' },
    });
    if (!order) throw new Error('Live order not found');
    if (!order.brokerOrderId) throw new Error('No broker order ID');

    const adapter = await this.brokerService.getLiveAdapter(userId);
    await adapter.cancelOrder?.(order.brokerOrderId);

    const updated = await this.db.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });

    await this.auditService.log(userId, 'LIVE_ORDER_CANCELLED', 'order', orderId, {}, request);
    return updated;
  }
}
