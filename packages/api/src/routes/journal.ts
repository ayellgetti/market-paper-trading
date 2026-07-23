import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@paper-trading/db';

const journalUpdateSchema = z.object({
  rangeStart: z.number().optional(),
  rangeEnd: z.number().optional(),
  stopLoss: z.number().optional(),
  target: z.number().optional(),
  notes: z.string().optional(),
});

export async function journalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;

    const entries = await prisma.tradeJournal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return entries.map((e) => ({
      id: e.id,
      symbol: e.symbol,
      segment: e.segment,
      rangeStart: e.rangeStart ? Number(e.rangeStart) : null,
      rangeEnd: e.rangeEnd ? Number(e.rangeEnd) : null,
      entryDate: e.entryDate,
      entryPrice: e.entryPrice ? Number(e.entryPrice) : null,
      stopLoss: e.stopLoss ? Number(e.stopLoss) : null,
      target: e.target ? Number(e.target) : null,
      quantity: e.quantity,
      expiry: e.expiry,
      ourEntry: e.ourEntry ? Number(e.ourEntry) : null,
      ourExit: e.ourExit ? Number(e.ourExit) : null,
      plPercent: e.plPercent ? Number(e.plPercent) : null,
      plAmount: e.plAmount ? Number(e.plAmount) : null,
      notes: e.notes,
      createdAt: e.createdAt,
    }));
  });

  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };
    const body = journalUpdateSchema.parse(request.body);

    const entry = await prisma.tradeJournal.findFirst({ where: { id, userId } });
    if (!entry) return reply.status(404).send({ error: 'Journal entry not found' });

    return prisma.tradeJournal.update({
      where: { id },
      data: body,
    });
  });
}
