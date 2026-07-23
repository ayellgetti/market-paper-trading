import type { ProductType, Segment } from '@paper-trading/db';

const MARGIN_RATES: Record<Segment, Record<ProductType, number>> = {
  EQUITY: { CNC: 1.0, MIS: 0.2, NRML: 1.0 },
  FNO: { CNC: 1.0, MIS: 0.12, NRML: 0.15 },
  COMMODITY: { CNC: 1.0, MIS: 0.12, NRML: 0.15 },
  CURRENCY: { CNC: 1.0, MIS: 0.12, NRML: 0.15 },
};

export class RiskEngine {
  calculateRiskAmount(balance: number, riskPercent: number): number {
    return balance * (riskPercent / 100);
  }

  calculateRewardAmount(riskAmount: number, rewardRatio: number): number {
    return riskAmount * rewardRatio;
  }

  calculateQuantity(
    riskAmount: number,
    entryPrice: number,
    stopLossPrice: number,
    lotSize = 1,
  ): number {
    const riskPerUnit = Math.abs(entryPrice - stopLossPrice);
    if (riskPerUnit === 0) return 0;
    const rawQty = riskAmount / riskPerUnit;
    return Math.floor(rawQty / lotSize) * lotSize;
  }

  canTrade(availableBalance: number, requiredMargin: number): boolean {
    return availableBalance >= requiredMargin;
  }

  calculateMargin(
    orderValue: number,
    productType: ProductType,
    segment: Segment = 'EQUITY',
  ): number {
    const rate = MARGIN_RATES[segment][productType] ?? 1.0;
    return orderValue * rate;
  }
}
