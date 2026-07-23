import type { OrderSide, OrderType, ProductType } from '@paper-trading/db';

export interface PlaceOrderInput {
  userId: string;
  paperAccountId: string;
  instrumentId: string;
  side: OrderSide;
  orderType: OrderType;
  productType: ProductType;
  quantity: number;
  price?: number;
  stopLoss?: number;
  target?: number;
  ltp?: number;
}
