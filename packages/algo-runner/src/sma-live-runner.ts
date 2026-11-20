import type { SMAParams } from '@paper-trading/strategy-sdk';
import { computeSMA } from '@paper-trading/strategy-sdk';
import type { PrismaClient } from '@paper-trading/db';
import { OrderService } from '@paper-trading/oms';
import { CircuitBreaker } from './circuit-breaker.js';
import { Redis } from 'ioredis';

export interface LiveRunnerCallbacks {
  onLog: (level: string, message: string) => Promise<void>;
  onSignal: (signalType: string, price: number, reason: string) => Promise<void>;
  onStopped: (reason: string) => Promise<void>;
}

interface InstrumentState {
  prices: number[];
  positionOpen: boolean;
}

/**
 * One runner per deployment. Price history and open-position state are tracked
 * per instrument; the circuit breaker (max loss / max orders) is shared.
 */
export class SMALiveRunner {
  private state = new Map<string, InstrumentState>();
  private breaker: CircuitBreaker;

  constructor(
    private config: SMAParams,
    private deploymentId: string,
    private userId: string,
    private paperAccountId: string,
    private db: PrismaClient,
    private orderService: OrderService,
    private redis: Redis,
    maxLoss: number | null,
    maxOrdersPerDay: number,
    private callbacks: LiveRunnerCallbacks,
  ) {
    this.breaker = new CircuitBreaker(maxLoss, maxOrdersPerDay);
  }

  async onTick(instrumentId: string, ltp: number, symbol: string): Promise<void> {
    if (this.breaker.isTripped()) {
      const reason = this.breaker.tripReason() ?? 'Circuit breaker';
      await this.callbacks.onStopped(reason);
      return;
    }

    let st = this.state.get(instrumentId);
    if (!st) {
      st = { prices: [], positionOpen: false };
      this.state.set(instrumentId, st);
    }

    st.prices.push(ltp);
    if (st.prices.length < this.config.slowPeriod + 1) return;

    const fast = computeSMA(st.prices, this.config.fastPeriod);
    const slow = computeSMA(st.prices, this.config.slowPeriod);
    const prevFast = computeSMA(st.prices.slice(0, -1), this.config.fastPeriod);
    const prevSlow = computeSMA(st.prices.slice(0, -1), this.config.slowPeriod);

    if (prevFast <= prevSlow && fast > slow && !st.positionOpen) {
      await this.executeSignal(instrumentId, 'BUY', ltp, `Fast SMA ${fast.toFixed(2)} crossed above ${slow.toFixed(2)}`, symbol);
      st.positionOpen = true;
    } else if (prevFast >= prevSlow && fast < slow && st.positionOpen) {
      await this.executeSignal(instrumentId, 'SELL', ltp, `Fast SMA ${fast.toFixed(2)} crossed below ${slow.toFixed(2)}`, symbol);
      st.positionOpen = false;
    }
  }

  private async executeSignal(
    instrumentId: string,
    side: 'BUY' | 'SELL',
    price: number,
    reason: string,
    symbol: string,
  ): Promise<void> {
    try {
      await this.callbacks.onSignal(side, price, reason);
      await this.callbacks.onLog('INFO', `${side} signal on ${symbol}: ${reason}`);

      const order = await this.orderService.placeOrder({
        userId: this.userId,
        paperAccountId: this.paperAccountId,
        instrumentId,
        side,
        orderType: 'MARKET',
        productType: this.config.productType,
        quantity: this.config.quantity,
        ltp: price,
      });

      await this.db.order.update({
        where: { id: order.id },
        data: { algoDeploymentId: this.deploymentId },
      });

      this.breaker.recordOrder();
      await this.publishEvent('order', { orderId: order.id, instrumentId, symbol, side, price });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Order failed';
      await this.callbacks.onLog('ERROR', msg);
    }
  }

  private async publishEvent(event: string, data: object): Promise<void> {
    await this.redis.publish(
      'algo-events',
      JSON.stringify({ deploymentId: this.deploymentId, event, data }),
    );
  }
}
