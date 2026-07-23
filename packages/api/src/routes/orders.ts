import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@paper-trading/db';
import { OrderService } from '@paper-trading/oms';
import { LiveOrderService } from '../services/live-order-service.js';
import { apiRateLimiter } from '../lib/rate-limiter.js';

const orderService = new OrderService(prisma);
const liveOrderService = new LiveOrderService(prisma);

const placeOrderSchema = z.object({
  paperAccountId: z.string(),
  instrumentId: z.string(),
  side: z.enum(['BUY', 'SELL']),
  orderType: z.enum(['MARKET', 'LIMIT']),
  productType: z.enum(['CNC', 'MIS', 'NRML']).default('CNC'),
  mode: z.enum(['PAPER', 'LIVE']).optional(),
  quantity: z.number().int().positive().optional(),
  lots: z.number().int().positive().optional(),
  price: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  target: z.number().positive().optional(),
  confirmLive: z.boolean().optional(),
});

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const limit = apiRateLimiter.check(`api:${userId}`);
    if (!limit.allowed) {
      return reply.status(429).send({ error: 'Rate limit exceeded', retryAfterMs: limit.retryAfterMs });
    }

    const body = placeOrderSchema.parse(request.body);

    const account = await prisma.paperAccount.findFirst({
      where: { id: body.paperAccountId, userId },
    });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    const mode = body.mode ?? account.preferredMode;

    const instrument = await prisma.instrument.findUniqueOrThrow({
      where: { id: body.instrumentId },
    });

    let quantity = body.quantity;
    if (body.lots != null) {
      quantity = body.lots * instrument.lotSize;
    }
    if (!quantity) {
      return reply.status(400).send({ error: 'quantity or lots is required' });
    }

    const latestTick = await prisma.marketTick.findFirst({
      where: { instrumentId: body.instrumentId },
      orderBy: { timestamp: 'desc' },
    });
    const ltp = latestTick ? Number(latestTick.ltp) : body.price;

    if (!ltp) {
      return reply.status(400).send({ error: 'No market price available' });
    }

    if (mode === 'LIVE') {
      if (!body.confirmLive) {
        return reply.status(400).send({
          error: 'LIVE orders require confirmLive:true. This will route to your connected broker.',
        });
      }
      const conn = await prisma.brokerConnection.findFirst({
        where: { userId, isActive: true },
      });
      if (!conn) {
        return reply.status(400).send({ error: 'No active broker connection' });
      }

      try {
        const order = await liveOrderService.placeOrder(
          {
            userId,
            paperAccountId: body.paperAccountId,
            instrumentId: body.instrumentId,
            side: body.side,
            orderType: body.orderType,
            productType: body.productType,
            quantity,
            price: body.price,
            ltp,
          },
          request,
        );

        return {
          ...order,
          price: order.price ? Number(order.price) : null,
          averagePrice: order.averagePrice ? Number(order.averagePrice) : null,
          instrument,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Live order failed';
        return reply.status(400).send({ error: message });
      }
    }

    try {
      const order = await orderService.placeOrder({
        userId,
        paperAccountId: body.paperAccountId,
        instrumentId: body.instrumentId,
        side: body.side,
        orderType: body.orderType,
        productType: body.productType,
        quantity,
        price: body.price,
        stopLoss: body.stopLoss,
        target: body.target,
        ltp,
      });

      return {
        ...order,
        price: order.price ? Number(order.price) : null,
        averagePrice: order.averagePrice ? Number(order.averagePrice) : null,
        instrument,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Order failed';
      return reply.status(400).send({ error: message });
    }
  });

  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;
    const { status } = request.query as { status?: string };

    const orders = await prisma.order.findMany({
      where: {
        userId,
        ...(status ? { status: status as 'OPEN' | 'COMPLETE' | 'PENDING' | 'CANCELLED' | 'REJECTED' } : {}),
      },
      include: { instrument: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return orders.map((o) => ({
      ...o,
      price: o.price ? Number(o.price) : null,
      averagePrice: o.averagePrice ? Number(o.averagePrice) : null,
      stopLoss: o.stopLoss ? Number(o.stopLoss) : null,
      target: o.target ? Number(o.target) : null,
      mode: o.mode,
      brokerOrderId: o.brokerOrderId,
    }));
  });

  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };

    const existing = await prisma.order.findFirst({ where: { id, userId } });
    if (!existing) return reply.status(404).send({ error: 'Order not found' });

    try {
      if (existing.mode === 'LIVE') {
        return await liveOrderService.cancelOrder(userId, id, request);
      }
      return await orderService.cancelOrder(userId, id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cancel failed';
      return reply.status(400).send({ error: message });
    }
  });
}
