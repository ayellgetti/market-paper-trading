import type { FastifyInstance } from 'fastify';
import { prisma } from '@paper-trading/db';


const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};
const MIN_CANDLES = 150;

interface CandleOut {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  simulated?: boolean;
}

function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic random-walk history that ends exactly at `endPrice`, used only to pad short real history. */
function simulatedHistory(
  seed: string,
  endPrice: number,
  endTimeMs: number,
  stepMs: number,
  count: number,
): CandleOut[] {
  const rand = seededRandom(seed);
  const vol = 0.0035;
  const out: CandleOut[] = [];
  let close = endPrice;
  for (let i = 1; i <= count; i++) {
    const open = close * (1 + (rand() - 0.5) * 2 * vol);
    const hi = Math.max(open, close) * (1 + rand() * vol * 0.6);
    const lo = Math.min(open, close) * (1 - rand() * vol * 0.6);
    out.push({
      time: Math.floor((endTimeMs - i * stepMs) / 1000),
      open: round2(open),
      high: round2(hi),
      low: round2(lo),
      close: round2(close),
      simulated: true,
    });
    close = open;
  }
  return out.reverse();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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


  app.get('/watchlist', { preHandler: [app.authenticate] }, async () => {
    const instruments = await prisma.instrument.findMany({
      where: { isActive: true },
      orderBy: [{ segment: 'asc' }, { symbol: 'asc' }],
    });
    return Promise.all(
      instruments.map(async (inst) => {
        const [latest, first] = await Promise.all([
          prisma.marketTick.findFirst({
            where: { instrumentId: inst.id },
            orderBy: { timestamp: 'desc' },
          }),
          prisma.marketTick.findFirst({
            where: { instrumentId: inst.id },
            orderBy: { timestamp: 'asc' },
          }),
        ]);
        const ltp = latest ? Number(latest.ltp) : null;
        const prevClose = latest?.close != null ? Number(latest.close) : first ? Number(first.ltp) : null;
        return { ...inst, ltp, prevClose };
      }),
    );
  });

  app.get('/:id/candles', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { interval = '5m' } = request.query as { interval?: string };
    const stepMs = INTERVAL_MS[interval];
    if (!stepMs) return reply.status(400).send({ error: 'interval must be one of 1m, 5m, 15m, 1h, 1d' });

    const ticks = await prisma.marketTick.findMany({
      where: { instrumentId: id },
      orderBy: { timestamp: 'asc' },
      take: 50_000,
      select: { ltp: true, timestamp: true },
    });
    if (ticks.length === 0) return { interval, candles: [] as CandleOut[] };

    const buckets = new Map<number, CandleOut>();
    for (const t of ticks) {
      const price = Number(t.ltp);
      const bucket = Math.floor(t.timestamp.getTime() / stepMs) * stepMs;
      const c = buckets.get(bucket);
      if (!c) {
        buckets.set(bucket, {
          time: bucket / 1000,
          open: price,
          high: price,
          low: price,
          close: price,
        });
      } else {
        c.high = Math.max(c.high, price);
        c.low = Math.min(c.low, price);
        c.close = price;
      }
    }
    const real = [...buckets.values()].sort((a, b) => a.time - b.time);

    const missing = Math.max(0, MIN_CANDLES - real.length);
    const history = missing
      ? simulatedHistory(id + interval, real[0].open, real[0].time * 1000, stepMs, missing)
      : [];
    return { interval, candles: [...history, ...real] };
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
