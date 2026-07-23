import type { FastifyInstance } from 'fastify';
import { prisma } from '@paper-trading/db';

export async function tradeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;

    const trades = await prisma.trade.findMany({
      where: { order: { userId } },
      include: {
        order: {
          include: { instrument: true },
        },
      },
      orderBy: { tradedAt: 'desc' },
      take: 100,
    });

    return trades.map((t) => ({
      id: t.id,
      datetime: t.tradedAt,
      action: t.order.side,
      stock: t.order.instrument.symbol,
      quantity: t.quantity,
      price: Number(t.price),
      totalCost: Number(t.price) * t.quantity,
      orderType: t.order.orderType,
      status: t.order.status,
    }));
  });
}
