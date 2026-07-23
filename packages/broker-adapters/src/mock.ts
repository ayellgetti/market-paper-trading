import { NSE_EQUITY_INSTRUMENTS } from './instruments.js';
import { ALL_DERIVATIVE_INSTRUMENTS, derivativeBrokerToken } from './derivatives.js';
import type { BrokerAdapter, BrokerCredentials, BrokerInstrument, BrokerTick, BrokerType } from './types.js';

export class MockBrokerAdapter implements BrokerAdapter {
  readonly brokerType: BrokerType = 'MOCK';
  private tickCallback: ((tick: BrokerTick) => void) | null = null;
  private prices = new Map<string, number>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private subscribed = new Set<string>();

  async connect(_credentials: BrokerCredentials): Promise<void> {
    for (const stock of NSE_EQUITY_INSTRUMENTS) {
      this.prices.set(stock.symbol, stock.basePrice);
    }
    for (const d of ALL_DERIVATIVE_INSTRUMENTS) {
      this.prices.set(derivativeBrokerToken(d), d.basePrice);
    }
  }

  async disconnect(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.subscribed.clear();
  }

  subscribe(instrumentTokens: string[]): void {
    for (const token of instrumentTokens) {
      this.subscribed.add(token);
    }
    this.startTicking();
  }

  unsubscribe(instrumentTokens: string[]): void {
    for (const token of instrumentTokens) {
      this.subscribed.delete(token);
    }
  }

  onTick(callback: (tick: BrokerTick) => void): void {
    this.tickCallback = callback;
  }

  async getQuote(instrumentToken: string): Promise<BrokerTick> {
    const ltp = this.prices.get(instrumentToken) ?? 1000;
    return this.buildTick(instrumentToken, ltp);
  }

  async searchInstruments(query: string): Promise<BrokerInstrument[]> {
    const q = query.toUpperCase();
    const equity = NSE_EQUITY_INSTRUMENTS.filter(
      (s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q),
    ).map((s) => ({
      symbol: s.symbol,
      name: s.name,
      exchange: 'NSE',
      instrumentToken: s.symbol,
      segment: 'EQUITY',
      instrumentType: 'EQ',
      lotSize: 1,
      tickSize: 0.05,
    }));

    const derivatives = ALL_DERIVATIVE_INSTRUMENTS.filter(
      (d) => d.symbol.includes(q) || d.name.toUpperCase().includes(q),
    ).map((d) => ({
      symbol: d.symbol,
      name: d.name,
      exchange: d.exchange,
      instrumentToken: derivativeBrokerToken(d),
      segment: d.segment,
      instrumentType: d.instrumentType,
      lotSize: d.lotSize,
      tickSize: d.tickSize,
    }));

    return [...equity, ...derivatives];
  }

  setPrice(token: string, price: number): void {
    this.prices.set(token, price);
  }

  private startTicking(): void {
    if (this.interval) return;

    this.interval = setInterval(() => {
      if (!this.tickCallback) return;

      for (const token of this.subscribed) {
        const current = this.prices.get(token) ?? 1000;
        const volatility = token.includes('FUT') || token.includes('CE') ? 0.003 : 0.002;
        const change = current * (Math.random() - 0.5) * volatility;
        const ltp = Math.round((current + change) * 100) / 100;
        this.prices.set(token, ltp);
        this.tickCallback(this.buildTick(token, ltp));
      }
    }, 2000);
  }

  private buildTick(instrumentToken: string, ltp: number): BrokerTick {
    const spread = ltp * 0.001;
    return {
      instrumentToken,
      ltp,
      open: ltp - spread,
      high: ltp + spread,
      low: ltp - spread * 2,
      close: ltp,
      volume: Math.floor(Math.random() * 10000),
      timestamp: new Date(),
    };
  }
}
