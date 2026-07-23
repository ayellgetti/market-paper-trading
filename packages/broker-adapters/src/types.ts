export type BrokerType =
  | 'ZERODHA'
  | 'ANGEL_ONE'
  | 'UPSTOX'
  | 'FYERS'
  | 'DHANI'
  | 'NSE_INDIA'
  | 'MOCK';

export interface BrokerCredentials {
  apiKey: string;
  apiSecret?: string;
  accessToken: string;
  refreshToken?: string;
}

export interface BrokerTick {
  instrumentToken: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export interface BrokerInstrument {
  symbol: string;
  name: string;
  exchange: string;
  instrumentToken: string;
  segment: string;
  instrumentType: string;
  lotSize: number;
  tickSize: number;
}

export interface BrokerOrder {
  symbol: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL_M';
  productType: 'CNC' | 'MIS' | 'NRML';
  quantity: number;
  price?: number;
  triggerPrice?: number;
  validity?: 'DAY' | 'IOC';
}

export interface BrokerOrderResponse {
  brokerOrderId: string;
  status: string;
  message?: string;
  averagePrice?: number;
  filledQuantity?: number;
}

export interface BrokerPosition {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  productType: string;
  pnl: number;
}

export interface BrokerFunds {
  available: number;
  used: number;
  total: number;
}

export interface BrokerAdapter {
  readonly brokerType: BrokerType;
  connect(credentials: BrokerCredentials): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(instrumentTokens: string[]): void;
  unsubscribe(instrumentTokens: string[]): void;
  onTick(callback: (tick: BrokerTick) => void): void;
  getQuote(instrumentToken: string): Promise<BrokerTick>;
  searchInstruments(query: string): Promise<BrokerInstrument[]>;

  placeOrder?(order: BrokerOrder): Promise<BrokerOrderResponse>;
  cancelOrder?(brokerOrderId: string): Promise<void>;
  getPositions?(): Promise<BrokerPosition[]>;
  getFunds?(): Promise<BrokerFunds>;
  getOrderBook?(): Promise<BrokerOrderResponse[]>;
}

export interface ZerodhaSession {
  accessToken: string;
  publicToken?: string;
  loginTime?: string;
  userId?: string;
  userName?: string;
}
