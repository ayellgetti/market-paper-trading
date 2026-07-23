import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@paper-trading/db';

const updateAccountSchema = z.object({
  riskPercent: z.number().min(0.1).max(100).optional(),
  rewardRatio: z.number().min(0.1).max(10).optional(),
  name: z.string().optional(),
  preferredMode: z.enum(['PAPER', 'LIVE']).optional(),
  confirmLive: z.boolean().optional(),
});

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;
    return prisma.paperAccount.findMany({ where: { userId } });
  });

  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };
    const account = await prisma.paperAccount.findFirst({ where: { id, userId } });
    if (!account) return reply.status(404).send({ error: 'Account not found' });
    return account;
  });

  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };
    const body = updateAccountSchema.parse(request.body);

    const account = await prisma.paperAccount.findFirst({ where: { id, userId } });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    if (body.preferredMode === 'LIVE') {
      if (!body.confirmLive) {
        return reply.status(400).send({
          error: 'Switching to LIVE mode requires confirmLive:true. Real money may be at risk.',
        });
      }
      const conn = await prisma.brokerConnection.findFirst({
        where: { userId, isActive: true },
      });
      if (!conn) {
        return reply.status(400).send({ error: 'Connect a broker before enabling LIVE mode' });
      }
    }

    const { confirmLive: _, ...data } = body;

    return prisma.paperAccount.update({
      where: { id },
      data,
    });
  });

  app.get('/:id/funds', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };
    const account = await prisma.paperAccount.findFirst({ where: { id, userId } });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    const positions = await prisma.position.findMany({
      where: { paperAccountId: id },
      include: { instrument: true },
    });

    const unrealizedPL = positions.reduce((sum, p) => sum + Number(p.unrealizedPL), 0);

    return {
      available: Number(account.currentBalance),
      used: Number(account.fundUsed),
      total: Number(account.startingBalance),
      realizedProfit: Number(account.realizedProfit),
      realizedLoss: Number(account.realizedLoss),
      unrealizedPL,
      riskPercent: Number(account.riskPercent),
      rewardRatio: Number(account.rewardRatio),
    };
  });
}
