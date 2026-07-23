import type { PrismaClient } from '@paper-trading/db';
import { OrderService } from './order-service.js';

export class SettlementService {
  private orderService: OrderService;

  constructor(private readonly db: PrismaClient) {
    this.orderService = new OrderService(db);
  }

  /** Auto square-off all MIS positions at exchange cutoff (3:20 PM IST) */
  async squareOffMisPositions(): Promise<number> {
    const misPositions = await this.db.position.findMany({
      where: { productType: 'MIS', mode: 'PAPER', quantity: { gt: 0 } },
      include: { instrument: true, paperAccount: { select: { userId: true } } },
    });

    let closed = 0;

    for (const pos of misPositions) {
      const tick = await this.db.marketTick.findFirst({
        where: { instrumentId: pos.instrumentId },
        orderBy: { timestamp: 'desc' },
      });
      const ltp = tick ? Number(tick.ltp) : Number(pos.averagePrice);

      try {
        await this.orderService.placeOrder({
          userId: pos.paperAccount.userId,
          paperAccountId: pos.paperAccountId,
          instrumentId: pos.instrumentId,
          side: pos.side === 'BUY' ? 'SELL' : 'BUY',
          orderType: 'MARKET',
          productType: 'MIS',
          quantity: pos.quantity,
          ltp,
        });
        closed++;
      } catch (err) {
        console.error(`Square-off failed for position ${pos.id}:`, err);
      }
    }

    return closed;
  }

  /** T+1 settlement: move CNC equity positions to holdings */
  async settleCncHoldings(): Promise<number> {
    const cncPositions = await this.db.position.findMany({
      where: {
        productType: 'CNC',
        mode: 'PAPER',
        quantity: { gt: 0 },
        instrument: { segment: 'EQUITY' },
      },
      include: { instrument: true },
    });

    let settled = 0;

    for (const pos of cncPositions) {
      await this.db.$transaction(async (tx) => {
        const existing = await tx.holding.findUnique({
          where: {
            paperAccountId_instrumentId: {
              paperAccountId: pos.paperAccountId,
              instrumentId: pos.instrumentId,
            },
          },
        });

        if (existing) {
          const totalQty = existing.quantity + pos.quantity;
          const avgPrice =
            (Number(existing.averagePrice) * existing.quantity +
              Number(pos.averagePrice) * pos.quantity) /
            totalQty;
          await tx.holding.update({
            where: { id: existing.id },
            data: { quantity: totalQty, averagePrice: avgPrice },
          });
        } else {
          await tx.holding.create({
            data: {
              paperAccountId: pos.paperAccountId,
              instrumentId: pos.instrumentId,
              quantity: pos.quantity,
              averagePrice: pos.averagePrice,
            },
          });
        }

        await tx.position.delete({ where: { id: pos.id } });
      });
      settled++;
    }

    return settled;
  }
}
