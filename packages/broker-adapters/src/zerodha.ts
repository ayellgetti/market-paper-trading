import { MockBrokerAdapter } from './mock.js';
import { KiteClient } from './kite-client.js';
import type {
  BrokerCredentials,
  BrokerFunds,
  BrokerOrder,
  BrokerOrderResponse,
  BrokerPosition,
  BrokerType,
} from './types.js';

type KiteOrder = {
  order_id: string;
  status: string;
  status_message?: string;
  average_price?: number;
  filled_quantity?: number;
  order_timestamp?: string;
  tradingsymbol?: string;
  transaction_type?: string;
  quantity?: number;
};

type KitePosition = {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  product: string;
  pnl: number;
};

type KiteMargins = {
  equity?: { available: { live_balance: number }; utilised: { debits: number } };
};

export class ZerodhaLiveAdapter extends MockBrokerAdapter {
  readonly brokerType: BrokerType = 'ZERODHA';
  private client: KiteClient | null = null;
  private simulated = false;

  override async connect(credentials: BrokerCredentials): Promise<void> {
    if (credentials.accessToken.startsWith('sim_')) {
      this.simulated = true;
      await super.connect(credentials);
      return;
    }

    if (!credentials.apiSecret) {
      throw new Error('Zerodha apiSecret required for live connection');
    }

    this.client = KiteClient.fromCredentials(credentials);
    this.simulated = false;
    await super.connect(credentials);
  }

  override async disconnect(): Promise<void> {
    this.client = null;
    await super.disconnect();
  }

  async placeOrder(order: BrokerOrder): Promise<BrokerOrderResponse> {
    if (this.simulated || !this.client) {
      return this.simulatedPlaceOrder(order);
    }

    const variety = order.orderType === 'MARKET' ? 'regular' : 'regular';
    const data = await this.client.request<{ order_id: string }>('POST', `/orders/${variety}`, {
      exchange: order.exchange,
      tradingsymbol: order.symbol,
      transaction_type: order.side,
      order_type: order.orderType,
      quantity: order.quantity,
      product: order.productType,
      validity: order.validity ?? 'DAY',
      ...(order.price != null ? { price: order.price } : {}),
      ...(order.triggerPrice != null ? { trigger_price: order.triggerPrice } : {}),
    });

    return {
      brokerOrderId: String(data.order_id),
      status: 'PENDING',
      message: 'Submitted to Zerodha',
    };
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    if (this.simulated || !this.client) return;
    await this.client.request('DELETE', `/orders/regular/${brokerOrderId}`);
  }

  async getPositions(): Promise<BrokerPosition[]> {
    if (this.simulated || !this.client) {
      return [];
    }

    const data = await this.client.request<{ net: KitePosition[] }>('GET', '/portfolio/positions');
    return (data.net ?? []).map((p) => ({
      symbol: p.tradingsymbol,
      exchange: p.exchange,
      quantity: p.quantity,
      averagePrice: p.average_price,
      productType: p.product,
      pnl: p.pnl,
    }));
  }

  async getFunds(): Promise<BrokerFunds> {
    if (this.simulated || !this.client) {
      return { available: 0, used: 0, total: 0 };
    }

    const data = await this.client.request<KiteMargins>('GET', '/user/margins');
    const available = data.equity?.available.live_balance ?? 0;
    const used = data.equity?.utilised.debits ?? 0;
    return { available, used, total: available + used };
  }

  async getOrderBook(): Promise<BrokerOrderResponse[]> {
    if (this.simulated || !this.client) {
      return this.simulatedOrders;
    }

    const data = await this.client.request<KiteOrder[]>('GET', '/orders');
    return data.map((o) => ({
      brokerOrderId: String(o.order_id),
      status: o.status,
      message: o.status_message,
      averagePrice: o.average_price,
      filledQuantity: o.filled_quantity,
    }));
  }

  private simulatedOrders: BrokerOrderResponse[] = [];

  private async simulatedPlaceOrder(order: BrokerOrder): Promise<BrokerOrderResponse> {
    const quote = await this.getQuote(order.symbol);
    const brokerOrderId = `SIM-${Date.now()}`;
    const response: BrokerOrderResponse = {
      brokerOrderId,
      status: 'COMPLETE',
      message: 'Simulated live order (no real broker call)',
      averagePrice: quote.ltp,
      filledQuantity: order.quantity,
    };
    this.simulatedOrders.unshift(response);
    return response;
  }
}
