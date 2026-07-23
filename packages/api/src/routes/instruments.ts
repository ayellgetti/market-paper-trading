import type { FastifyInstance } from 'fastify';
import { prisma } from '@paper-trading/db';

export async function instrumentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/search', { preHandler: [app.authenticate] }, async (request) => {
    const { q = '', segment } = request.query as { q?: string; segment?: string };
    const query = q.trim();
    if (!query) return [];

    return prisma.instrument.findMany({
      where: {
        isActive: true,
        ...(segment ? { segment: segment as 'EQUITY' | 'FNO' | 'COMMODITY' | 'CURRENCY' } : {}),
        OR: [
          { symbol: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { symbol: 'asc' },
    });
  });

  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const instrument = await prisma.instrument.findUnique({ where: { id } });
    if (!instrument) return reply.status(404).send({ error: 'Instrument not found' });
    return instrument;
  });

  app.get('/:id/quote', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tick = await prisma.marketTick.findFirst({
      where: { instrumentId: id },
      orderBy: { timestamp: 'desc' },
      include: { instrument: true },
    });

    if (!tick) {
      const instrument = await prisma.instrument.findUnique({ where: { id } });
      if (!instrument) return reply.status(404).send({ error: 'Instrument not found' });
      return { instrumentId: id, symbol: instrument.symbol, ltp: null };
    }

    return {
      instrumentId: id,
      symbol: tick.instrument.symbol,
      ltp: Number(tick.ltp),
      timestamp: tick.timestamp,
    };
  });
}
