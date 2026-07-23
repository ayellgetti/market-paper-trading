import type { OrderSide } from '@paper-trading/db';

export interface FillResult {
  quantity: number;
  price: number;
}

const DEFAULT_SLIPPAGE_BPS = 5;

export function simulateMarketFill(
  side: OrderSide,
  quantity: number,
  ltp: number,
  slippageBps = DEFAULT_SLIPPAGE_BPS,
): FillResult {
  const slippage = ltp * (slippageBps / 10000);
  const price = side === 'BUY' ? ltp + slippage : ltp - slippage;
  return { quantity, price: roundPrice(price) };
}

export function checkLimitFill(
  side: OrderSide,
  quantity: number,
  limitPrice: number,
  ltp: number,
): FillResult | null {
  if (side === 'BUY' && ltp <= limitPrice) {
    return { quantity, price: roundPrice(limitPrice) };
  }
  if (side === 'SELL' && ltp >= limitPrice) {
    return { quantity, price: roundPrice(limitPrice) };
  }
  return null;
}

function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}
