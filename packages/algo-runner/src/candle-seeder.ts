import type { PrismaClient } from '@paper-trading/db';

const CANDLES_PER_DAY_5M = 75; // ~6.25 hours of market

export async function seedCandlesIfNeeded(
  db: PrismaClient,
  instrumentId: string,
  days = 30,
  interval = '5m',
  basePrice = 2850,
): Promise<number> {
  const existing = await db.candle.count({
    where: { instrumentId, interval },
  });

  if (existing >= days * CANDLES_PER_DAY_5M * 0.5) {
    return existing;
  }

  const tick = await db.marketTick.findFirst({
    where: { instrumentId },
    orderBy: { timestamp: 'desc' },
  });
  let price = tick ? Number(tick.ltp) : basePrice;

  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const intervalMs = 5 * 60 * 1000;
  const candles: Array<{
    instrumentId: string;
    interval: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: bigint;
    timestamp: Date;
  }> = [];

  for (let t = start.getTime(); t < now.getTime(); t += intervalMs) {
    const date = new Date(t);
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue;

    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    const istMinutes = hour * 60 + minute + 330;
    const istHour = Math.floor(istMinutes / 60) % 24;
    const istMin = istMinutes % 60;
    if (istHour < 9 || (istHour === 9 && istMin < 15) || istHour >= 15 || (istHour === 15 && istMin > 30)) {
      continue;
    }

    const change = price * (Math.random() - 0.48) * 0.004;
    const open = price;
    const close = Math.round((price + change) * 100) / 100;
    const high = Math.max(open, close) * (1 + Math.random() * 0.002);
    const low = Math.min(open, close) * (1 - Math.random() * 0.002);
    price = close;

    candles.push({
      instrumentId,
      interval,
      open,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close,
      volume: BigInt(Math.floor(Math.random() * 50000)),
      timestamp: date,
    });
  }

  for (const batch of chunk(candles, 500)) {
    await db.candle.createMany({ data: batch, skipDuplicates: true });
  }

  return candles.length;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function loadCandles(
  db: PrismaClient,
  instrumentId: string,
  interval: string,
  days: number,
) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.candle.findMany({
    where: { instrumentId, interval, timestamp: { gte: since } },
    orderBy: { timestamp: 'asc' },
  });
}
