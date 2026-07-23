import type { Instrument, Order, PrismaClient } from '@paper-trading/db';

export class JournalService {
  constructor(private readonly db: PrismaClient) {}

  async createFromFill(
    order: Order & { instrument: Instrument },
    fillPrice: number,
    fillQty: number,
  ): Promise<void> {
    const plAmount =
      order.side === 'SELL'
        ? (fillPrice - Number(order.averagePrice ?? fillPrice)) * fillQty
        : undefined;

    await this.db.tradeJournal.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        symbol: order.instrument.symbol,
        segment: order.instrument.segment,
        entryDate: order.createdAt,
        entryPrice: order.side === 'BUY' ? fillPrice : undefined,
        stopLoss: order.stopLoss,
        target: order.target,
        quantity: fillQty,
        expiry: order.instrument.expiry,
        ourEntry: order.side === 'BUY' ? fillPrice : undefined,
        ourExit: order.side === 'SELL' ? fillPrice : undefined,
        plAmount: plAmount ?? null,
        plPercent:
          plAmount != null && order.averagePrice
            ? (plAmount / (Number(order.averagePrice) * fillQty)) * 100
            : null,
      },
    });
  }

  async updateExitOnSell(
    userId: string,
    order: Order & { instrument: Instrument },
    fillPrice: number,
    fillQty: number,
    avgPrice: number,
  ): Promise<void> {
    const plAmount = (fillPrice - avgPrice) * fillQty;
    const plPercent = (plAmount / (avgPrice * fillQty)) * 100;

    const openEntry = await this.db.tradeJournal.findFirst({
      where: {
        userId,
        symbol: order.instrument.symbol,
        segment: order.instrument.segment,
        ourExit: null,
        orderId: { not: order.id },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (openEntry) {
      await this.db.tradeJournal.update({
        where: { id: openEntry.id },
        data: {
          ourExit: fillPrice,
          plAmount,
          plPercent,
        },
      });
    } else {
      await this.db.tradeJournal.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          symbol: order.instrument.symbol,
          segment: order.instrument.segment,
          entryDate: order.createdAt,
          entryPrice: avgPrice,
          quantity: fillQty,
          expiry: order.instrument.expiry,
          ourEntry: avgPrice,
          ourExit: fillPrice,
          plAmount,
          plPercent,
        },
      });
    }
  }
}
