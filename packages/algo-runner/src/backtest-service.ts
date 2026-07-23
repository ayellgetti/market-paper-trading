import type { PrismaClient } from '@paper-trading/db';
import type { BacktestResult, SMAConfig } from '@paper-trading/strategy-sdk';
import { runSMACrossoverBacktest } from './backtest-engine.js';
import { loadCandles, seedCandlesIfNeeded } from './candle-seeder.js';

export async function runBacktestForAlgo(
  db: PrismaClient,
  config: SMAConfig,
  days = 30,
  interval = '5m',
): Promise<BacktestResult> {
  const instrument = await db.instrument.findUniqueOrThrow({
    where: { id: config.instrumentId },
  });
  void instrument;

  const tick = await db.marketTick.findFirst({
    where: { instrumentId: config.instrumentId },
    orderBy: { timestamp: 'desc' },
  });
  const basePrice = tick ? Number(tick.ltp) : 2850;

  await seedCandlesIfNeeded(db, config.instrumentId, days, interval, basePrice);

  const rows = await loadCandles(db, config.instrumentId, interval, days);

  if (config.strategyType !== 'sma_crossover') {
    throw new Error('Only sma_crossover backtest is supported in Phase 3');
  }

  return runSMACrossoverBacktest(
    rows.map((c) => ({
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
      timestamp: c.timestamp,
    })),
    config,
  );
}
