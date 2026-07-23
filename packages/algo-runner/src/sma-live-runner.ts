import type { SMAConfig } from '@paper-trading/strategy-sdk';
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

export class SMALiveRunner {
  private prices: number[] = [];
  private positionOpen = false;
  private breaker: CircuitBreaker;

  constructor(
    private config: SMAConfig,
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

  async onTick(ltp: number, symbol: string): Promise<void> {
    if (this.breaker.isTripped()) {
      const reason = this.breaker.tripReason() ?? 'Circuit breaker';
      await this.callbacks.onStopped(reason);
      return;
    }

    this.prices.push(ltp);
    if (this.prices.length < this.config.slowPeriod + 1) return;

    const fast = computeSMA(this.prices, this.config.fastPeriod);
    const slow = computeSMA(this.prices, this.config.slowPeriod);
    const prevFast = computeSMA(this.prices.slice(0, -1), this.config.fastPeriod);
    const prevSlow = computeSMA(this.prices.slice(0, -1), this.config.slowPeriod);

    if (prevFast <= prevSlow && fast > slow && !this.positionOpen) {
      await this.executeSignal('BUY', ltp, `Fast SMA ${fast.toFixed(2)} crossed above ${slow.toFixed(2)}`, symbol);
      this.positionOpen = true;
    } else if (prevFast >= prevSlow && fast < slow && this.positionOpen) {
      await this.executeSignal('SELL', ltp, `Fast SMA ${fast.toFixed(2)} crossed below ${slow.toFixed(2)}`, symbol);
      this.positionOpen = false;
    }
  }

  private async executeSignal(
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
        instrumentId: this.config.instrumentId,
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
      await this.publishEvent('order', { orderId: order.id, side, price });
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
