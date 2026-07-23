import type { FastifyInstance } from 'fastify';
import { prisma } from '@paper-trading/db';

export async function holdingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;
    const { accountId } = request.query as { accountId?: string };

    const accounts = await prisma.paperAccount.findMany({
      where: { userId, ...(accountId ? { id: accountId } : {}) },
      select: { id: true },
    });

    const holdings = await prisma.holding.findMany({
      where: { paperAccountId: { in: accounts.map((a) => a.id) } },
      include: { instrument: true },
      orderBy: { updatedAt: 'desc' },
    });

    return holdings.map((h) => ({
      id: h.id,
      quantity: h.quantity,
      averagePrice: Number(h.averagePrice),
      updatedAt: h.updatedAt,
      instrument: h.instrument,
    }));
  });
}
