import type { FastifyInstance } from 'fastify';
import { prisma } from '@paper-trading/db';

export async function positionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;
    const { accountId } = request.query as { accountId?: string };

    const accounts = await prisma.paperAccount.findMany({
      where: { userId, ...(accountId ? { id: accountId } : {}) },
      select: { id: true },
    });

    const positions = await prisma.position.findMany({
      where: { paperAccountId: { in: accounts.map((a) => a.id) } },
      include: { instrument: true },
      orderBy: { updatedAt: 'desc' },
    });

    return positions.map((p) => ({
      ...p,
      averagePrice: Number(p.averagePrice),
      unrealizedPL: Number(p.unrealizedPL),
      stopLoss: p.stopLoss ? Number(p.stopLoss) : null,
      target: p.target ? Number(p.target) : null,
      productType: p.productType,
    }));
  });
}
