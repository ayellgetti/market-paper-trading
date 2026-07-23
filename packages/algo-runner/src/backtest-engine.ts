import type { BacktestResult, BacktestTrade, SMAConfig } from '@paper-trading/strategy-sdk';
import { computeSMA } from '@paper-trading/strategy-sdk';

export interface CandleRow {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export function runSMACrossoverBacktest(
  candles: CandleRow[],
  config: SMAConfig,
): BacktestResult {
  const prices: number[] = [];
  const trades: BacktestTrade[] = [];
  let position: { qty: number; avgPrice: number } | null = null;
  let totalPnL = 0;
  let wins = 0;

  for (const candle of candles) {
    prices.push(candle.close);
    if (prices.length < config.slowPeriod + 1) continue;

    const fast = computeSMA(prices, config.fastPeriod);
    const slow = computeSMA(prices, config.slowPeriod);
    const prevFast = computeSMA(prices.slice(0, -1), config.fastPeriod);
    const prevSlow = computeSMA(prices.slice(0, -1), config.slowPeriod);

    if (prevFast <= prevSlow && fast > slow && !position) {
      position = { qty: config.quantity, avgPrice: candle.close };
      trades.push({
        side: 'BUY',
        price: candle.close,
        quantity: config.quantity,
        timestamp: candle.timestamp,
      });
    } else if (prevFast >= prevSlow && fast < slow && position) {
      const pnl = (candle.close - position.avgPrice) * position.qty;
      totalPnL += pnl;
      if (pnl > 0) wins++;
      trades.push({
        side: 'SELL',
        price: candle.close,
        quantity: position.qty,
        timestamp: candle.timestamp,
        pnl,
      });
      position = null;
    }
  }

  const closedTrades = trades.filter((t) => t.side === 'SELL').length;

  return {
    trades,
    totalPnL,
    winRate: closedTrades > 0 ? (wins / closedTrades) * 100 : 0,
    totalTrades: trades.length,
    candleCount: candles.length,
  };
}
