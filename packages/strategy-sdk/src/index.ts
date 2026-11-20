export interface Tick {
  instrumentId: string;
  symbol: string;
  ltp: number;
  volume: number;
  timestamp: Date;
}

export interface Candle {
  instrumentId: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export interface OrderRequest {
  instrumentId: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL_M';
  productType: 'CNC' | 'MIS' | 'NRML';
  quantity: number;
  price?: number;
  triggerPrice?: number;
  stopLoss?: number;
  target?: number;
}

export interface Order {
  id: string;
  status: string;
  side: string;
  quantity: number;
  filledQuantity: number;
  averagePrice: number;
}

export interface Position {
  instrumentId: string;
  quantity: number;
  averagePrice: number;
  side: 'BUY' | 'SELL';
}

export interface StrategyContext {
  placeOrder(request: OrderRequest): Promise<Order>;
  getPositions(): Promise<Position[]>;
  getLTP(instrumentId: string): number | undefined;
  log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void;
  config: Record<string, unknown>;
}

export abstract class Strategy {
  protected context: StrategyContext;

  constructor(context: StrategyContext) {
    this.context = context;
  }

  abstract onTick(tick: Tick): void | Promise<void>;
  onCandle?(candle: Candle): void | Promise<void>;
  onOrderUpdate?(order: Order): void | Promise<void>;
  onStart?(): void | Promise<void>;
  onStop?(): void | Promise<void>;

  protected placeOrder(request: OrderRequest): Promise<Order> {
    return this.context.placeOrder(request);
  }

  protected getPositions(): Promise<Position[]> {
    return this.context.getPositions();
  }

  protected getLTP(instrumentId: string): number | undefined {
    return this.context.getLTP(instrumentId);
  }

  protected log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
    this.context.log(level, message);
  }
}

export interface SMAConfig {
  strategyType: 'sma_crossover';
  instrumentId: string;
  fastPeriod: number;
  slowPeriod: number;
  quantity: number;
  productType: 'CNC' | 'MIS' | 'NRML';
}

/** Strategy parameters shared by every instrument a deployment trades. */
export type SMAParams = Omit<SMAConfig, 'instrumentId'>;

export interface BacktestTrade {
  symbol?: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timestamp: Date;
  pnl?: number;
}

export interface InstrumentBacktestSummary {
  instrumentId: string;
  symbol: string;
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  candleCount: number;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  candleCount: number;
  /** Present when the backtest covered more than one instrument. */
  perInstrument?: InstrumentBacktestSummary[];
}

export function computeSMA(prices: number[], period: number): number {
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export const DEFAULT_SMA_SOURCE = `// SMA Crossover Strategy
// Deploy config: fastPeriod, slowPeriod, quantity, productType
// Buy when fast SMA crosses above slow SMA; sell on reverse cross.

import { Strategy, Candle } from '@paper-trading/strategy-sdk';

export default class SMACrossover extends Strategy {
  private prices: number[] = [];
  private fastPeriod = 9;
  private slowPeriod = 21;

  onStart(): void {
    this.fastPeriod = (this.context.config.fastPeriod as number) ?? 9;
    this.slowPeriod = (this.context.config.slowPeriod as number) ?? 21;
    this.log('INFO', \`SMA Crossover started (\${this.fastPeriod}/\${this.slowPeriod})\`);
  }

  onCandle(candle: Candle): void {
    this.prices.push(candle.close);
    if (this.prices.length < this.slowPeriod + 1) return;

    const fast = computeSMA(this.prices, this.fastPeriod);
    const slow = computeSMA(this.prices, this.slowPeriod);
    const prevFast = computeSMA(this.prices.slice(0, -1), this.fastPeriod);
    const prevSlow = computeSMA(this.prices.slice(0, -1), this.slowPeriod);
    const qty = this.context.config.quantity as number;

    if (prevFast <= prevSlow && fast > slow) {
      void this.placeOrder({
        instrumentId: candle.instrumentId,
        side: 'BUY',
        orderType: 'MARKET',
        productType: this.context.config.productType as 'MIS',
        quantity: qty,
      });
    } else if (prevFast >= prevSlow && fast < slow) {
      void this.placeOrder({
        instrumentId: candle.instrumentId,
        side: 'SELL',
        orderType: 'MARKET',
        productType: this.context.config.productType as 'MIS',
        quantity: qty,
      });
    }
  }
}

function computeSMA(prices: number[], period: number): number {
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}
`;
