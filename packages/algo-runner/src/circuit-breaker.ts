export class CircuitBreaker {
  private ordersToday = 0;
  private cumulativeLoss = 0;
  private lastResetDate = new Date().toDateString();

  constructor(
    private maxLoss: number | null,
    private maxOrdersPerDay: number,
  ) {}

  recordOrder(pnl = 0): void {
    this.resetIfNewDay();
    this.ordersToday++;
    if (pnl < 0) this.cumulativeLoss += Math.abs(pnl);
  }

  isTripped(): boolean {
    this.resetIfNewDay();
    if (this.maxLoss != null && this.cumulativeLoss >= this.maxLoss) return true;
    if (this.ordersToday >= this.maxOrdersPerDay) return true;
    return false;
  }

  tripReason(): string | null {
    if (this.maxLoss != null && this.cumulativeLoss >= this.maxLoss) {
      return `Max loss breached (₹${this.cumulativeLoss.toFixed(2)})`;
    }
    if (this.ordersToday >= this.maxOrdersPerDay) {
      return `Max orders per day reached (${this.ordersToday})`;
    }
    return null;
  }

  private resetIfNewDay(): void {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.ordersToday = 0;
      this.cumulativeLoss = 0;
      this.lastResetDate = today;
    }
  }
}
