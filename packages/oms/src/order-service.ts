import { type PrismaClient, type Order, type Instrument } from '@paper-trading/db';
import { RiskEngine } from './risk-engine.js';
import { checkLimitFill, simulateMarketFill } from './paper-fill-engine.js';
import { OrderValidator } from './order-validator.js';
import { JournalService } from './journal-service.js';
import type { PlaceOrderInput } from './types.js';

const riskEngine = new RiskEngine();
const orderValidator = new OrderValidator();

export class OrderService {
  private journalService: JournalService;

  constructor(private readonly db: PrismaClient) {
    this.journalService = new JournalService(db);
  }

  async placeOrder(input: PlaceOrderInput): Promise<Order> {
    const account = await this.db.paperAccount.findFirstOrThrow({
      where: { id: input.paperAccountId, userId: input.userId },
    });

    const instrument = await this.db.instrument.findFirstOrThrow({
      where: { id: input.instrumentId },
    });

    orderValidator.validateProductForSegment(instrument.segment, input.productType);
    orderValidator.validateQuantity(instrument, input.quantity);
    orderValidator.validateExpiry(instrument);

    const price = input.price ?? input.ltp ?? 0;
    const orderValue = price * input.quantity;
    const margin = riskEngine.calculateMargin(
      orderValue,
      input.productType,
      instrument.segment,
    );
    const available = Number(account.currentBalance);

    if (!riskEngine.canTrade(available, margin)) {
      throw new Error('Insufficient funds for this order');
    }

    const order = await this.db.order.create({
      data: {
        userId: input.userId,
        paperAccountId: input.paperAccountId,
        instrumentId: input.instrumentId,
        mode: 'PAPER',
        side: input.side,
        orderType: input.orderType,
        productType: input.productType,
        quantity: input.quantity,
        price: input.price,
        stopLoss: input.stopLoss,
        target: input.target,
        status: 'PENDING',
      },
    });

    if (input.orderType === 'MARKET' && input.ltp != null) {
      return this.fillOrder(order.id, input.ltp);
    }

    if (input.orderType === 'LIMIT' && input.price != null && input.ltp != null) {
      const fill = checkLimitFill(input.side, input.quantity, input.price, input.ltp);
      if (fill) {
        return this.fillOrder(order.id, fill.price);
      }
      await this.db.order.update({
        where: { id: order.id },
        data: { status: 'OPEN' },
      });
    }

    return order;
  }

  async fillOrder(orderId: string, fillPrice: number): Promise<Order> {
    const order = await this.db.order.findFirstOrThrow({
      where: { id: orderId },
      include: { instrument: true },
    });

    if (order.status === 'COMPLETE' || order.status === 'CANCELLED') {
      return order;
    }

    const fill =
      order.orderType === 'MARKET'
        ? simulateMarketFill(order.side, order.quantity, fillPrice)
        : { quantity: order.quantity, price: fillPrice };

    const avgPriceBeforeSell =
      order.side === 'SELL'
        ? await this.getPositionAvgPrice(order.paperAccountId, order.instrumentId, order.productType)
        : 0;

    await this.db.$transaction(async (tx) => {
      await tx.trade.create({
        data: {
          orderId: order.id,
          quantity: fill.quantity,
          price: fill.price,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'COMPLETE',
          filledQuantity: fill.quantity,
          averagePrice: fill.price,
        },
      });

      await this.updatePosition(tx, order, fill.price);
      await this.updateAccountFunds(tx, order, fill.price, order.instrument);
    });

    const filled = await this.db.order.findFirstOrThrow({
      where: { id: orderId },
      include: { instrument: true },
    });

    if (order.side === 'BUY') {
      await this.journalService.createFromFill(filled, fill.price, fill.quantity);
    } else {
      await this.journalService.updateExitOnSell(
        order.userId,
        filled,
        fill.price,
        fill.quantity,
        avgPriceBeforeSell,
      );
    }

    return filled;
  }

  async processOpenOrders(instrumentId: string, ltp: number): Promise<void> {
    const openOrders = await this.db.order.findMany({
      where: {
        instrumentId,
        status: 'OPEN',
        orderType: 'LIMIT',
        mode: 'PAPER',
      },
    });

    for (const order of openOrders) {
      if (order.price == null) continue;
      const fill = checkLimitFill(
        order.side,
        order.quantity,
        Number(order.price),
        ltp,
      );
      if (fill) {
        await this.fillOrder(order.id, fill.price);
      }
    }
  }

  async cancelOrder(userId: string, orderId: string): Promise<Order> {
    const order = await this.db.order.findFirstOrThrow({
      where: { id: orderId, userId },
    });

    if (order.status !== 'OPEN' && order.status !== 'PENDING') {
      throw new Error('Only open or pending orders can be cancelled');
    }

    return this.db.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });
  }

  private async getPositionAvgPrice(
    paperAccountId: string,
    instrumentId: string,
    productType: Order['productType'],
  ): Promise<number> {
    const pos = await this.db.position.findUnique({
      where: {
        paperAccountId_instrumentId_productType_mode: {
          paperAccountId,
          instrumentId,
          productType,
          mode: 'PAPER',
        },
      },
    });
    return pos ? Number(pos.averagePrice) : 0;
  }

  private async updatePosition(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    order: Order & { instrument: Instrument },
    fillPrice: number,
  ): Promise<void> {
    const existing = await tx.position.findUnique({
      where: {
        paperAccountId_instrumentId_productType_mode: {
          paperAccountId: order.paperAccountId,
          instrumentId: order.instrumentId,
          productType: order.productType,
          mode: 'PAPER',
        },
      },
    });

    if (order.side === 'BUY') {
      if (existing) {
        const totalQty = existing.quantity + order.quantity;
        const avgPrice =
          (Number(existing.averagePrice) * existing.quantity + fillPrice * order.quantity) /
          totalQty;
        await tx.position.update({
          where: { id: existing.id },
          data: {
            quantity: totalQty,
            averagePrice: avgPrice,
            side: 'BUY',
            stopLoss: order.stopLoss ?? existing.stopLoss,
            target: order.target ?? existing.target,
          },
        });
      } else {
        await tx.position.create({
          data: {
            paperAccountId: order.paperAccountId,
            instrumentId: order.instrumentId,
            mode: 'PAPER',
            side: 'BUY',
            quantity: order.quantity,
            averagePrice: fillPrice,
            productType: order.productType,
            stopLoss: order.stopLoss,
            target: order.target,
          },
        });
      }
      return;
    }

    if (!existing || existing.quantity < order.quantity) {
      throw new Error('Insufficient position to sell');
    }

    const remaining = existing.quantity - order.quantity;
    const costReleased = Number(existing.averagePrice) * order.quantity;
    const proceeds = fillPrice * order.quantity;
    const realizedPL = proceeds - costReleased;

    if (remaining === 0) {
      await tx.position.delete({ where: { id: existing.id } });
    } else {
      await tx.position.update({
        where: { id: existing.id },
        data: { quantity: remaining },
      });
    }

    const account = await tx.paperAccount.findFirstOrThrow({
      where: { id: order.paperAccountId },
    });

    await tx.paperAccount.update({
      where: { id: order.paperAccountId },
      data: {
        fundUsed: Math.max(0, Number(account.fundUsed) - costReleased),
        currentBalance: Number(account.currentBalance) + proceeds,
        realizedProfit:
          realizedPL > 0
            ? Number(account.realizedProfit) + realizedPL
            : account.realizedProfit,
        realizedLoss:
          realizedPL < 0
            ? Number(account.realizedLoss) + Math.abs(realizedPL)
            : account.realizedLoss,
      },
    });
  }

  private async updateAccountFunds(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    order: Order,
    fillPrice: number,
    instrument: Instrument,
  ): Promise<void> {
    if (order.side !== 'BUY') return;

    const orderValue = fillPrice * order.quantity;
    const margin = riskEngine.calculateMargin(
      orderValue,
      order.productType,
      instrument.segment,
    );

    const account = await tx.paperAccount.findFirstOrThrow({
      where: { id: order.paperAccountId },
    });

    await tx.paperAccount.update({
      where: { id: order.paperAccountId },
      data: {
        fundUsed: Number(account.fundUsed) + margin,
        currentBalance: Number(account.currentBalance) - margin,
      },
    });
  }
}

export async function updatePositionMTM(
  db: PrismaClient,
  instrumentId: string,
  ltp: number,
): Promise<void> {
  const positions = await db.position.findMany({
    where: { instrumentId, mode: 'PAPER' },
  });

  for (const pos of positions) {
    const unrealizedPL =
      pos.side === 'BUY'
        ? (ltp - Number(pos.averagePrice)) * pos.quantity
        : (Number(pos.averagePrice) - ltp) * pos.quantity;

    await db.position.update({
      where: { id: pos.id },
      data: { unrealizedPL },
    });
  }
}
