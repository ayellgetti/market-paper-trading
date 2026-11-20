import type { PrismaClient } from '@paper-trading/db';
import type {
  BacktestResult,
  BacktestTrade,
  InstrumentBacktestSummary,
  SMAParams,
} from '@paper-trading/strategy-sdk';
import { runSMACrossoverBacktest } from './backtest-engine.js';
import { loadCandles, seedCandlesIfNeeded } from './candle-seeder.js';

async function backtestInstrument(
  db: PrismaClient,
  params: SMAParams,
  instrumentId: string,
  days: number,
  interval: string,
): Promise<{ symbol: string; result: BacktestResult }> {
  const instrument = await db.instrument.findUniqueOrThrow({ where: { id: instrumentId } });

  const tick = await db.marketTick.findFirst({
    where: { instrumentId },
    orderBy: { timestamp: 'desc' },
  });
  const basePrice = tick ? Number(tick.ltp) : 2850;

  await seedCandlesIfNeeded(db, instrumentId, days, interval, basePrice);
  const rows = await loadCandles(db, instrumentId, interval, days);

  const result = runSMACrossoverBacktest(
    rows.map((c) => ({
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
      timestamp: c.timestamp,
    })),
    { ...params, instrumentId },
  );
  return { symbol: instrument.symbol, result };
}

/** Runs the strategy on each instrument independently and combines the results. */
export async function runBacktestForAlgo(
  db: PrismaClient,
  params: SMAParams,
  instrumentIds: string[],
  days = 30,
  interval = '5m',
): Promise<BacktestResult> {
  if (params.strategyType !== 'sma_crossover') {
    throw new Error('Only sma_crossover backtest is supported in Phase 3');
  }

  const perInstrument: InstrumentBacktestSummary[] = [];
  const trades: BacktestTrade[] = [];
  let candleCount = 0;

  for (const instrumentId of instrumentIds) {
    const { symbol, result } = await backtestInstrument(db, params, instrumentId, days, interval);
    perInstrument.push({
      instrumentId,
      symbol,
      totalPnL: result.totalPnL,
      winRate: result.winRate,
      totalTrades: result.totalTrades,
      candleCount: result.candleCount,
    });
    trades.push(...result.trades.map((t) => ({ ...t, symbol })));
    candleCount += result.candleCount;
  }

  trades.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const closed = trades.filter((t) => t.side === 'SELL');
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;

  return {
    trades,
    totalPnL: perInstrument.reduce((sum, p) => sum + p.totalPnL, 0),
    winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
    totalTrades: trades.length,
    candleCount,
    ...(instrumentIds.length > 1 ? { perInstrument } : {}),
  };
}
