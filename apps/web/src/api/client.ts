const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001/ws';

export type Segment = 'EQUITY' | 'FNO' | 'COMMODITY' | 'CURRENCY' | 'ALL';

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string): void {
  localStorage.setItem('token', token);
}

export function clearToken(): void {
  localStorage.removeItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

export const api = {
  register: (email: string, password: string, name?: string) =>
    request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<MeResponse>('/api/v1/auth/me'),
  getFunds: (accountId: string) => request<FundsResponse>(`/api/v1/accounts/${accountId}/funds`),
  updateAccount: (
    accountId: string,
    data: {
      riskPercent?: number;
      rewardRatio?: number;
      startingBalance?: number;
      preferredMode?: 'PAPER' | 'LIVE';
      confirmLive?: boolean;
    },
  ) => request(`/api/v1/accounts/${accountId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  searchInstruments: (q: string, segment?: Segment) => {
    const params = new URLSearchParams({ q });
    if (segment && segment !== 'ALL') params.set('segment', segment);
    return request<Instrument[]>(`/api/v1/instruments/search?${params}`);
  },
  getWatchlist: () => request<WatchlistItem[]>('/api/v1/instruments/watchlist'),
  getCandles: (id: string, interval: CandleInterval) =>
    request<{ interval: string; candles: Candle[] }>(
      `/api/v1/instruments/${id}/candles?interval=${interval}`,
    ),
  getQuote: (id: string) => request<QuoteResponse>(`/api/v1/instruments/${id}/quote`),
  placeOrder: (data: PlaceOrderBody) =>
    request('/api/v1/orders', { method: 'POST', body: JSON.stringify(data) }),
  cancelOrder: (id: string) =>
    request(`/api/v1/orders/${id}`, { method: 'DELETE' }),
  getOrders: (status?: string) =>
    request<OrderEntry[]>(`/api/v1/orders${status ? `?status=${status}` : ''}`),
  getPositions: (accountId: string) =>
    request<Position[]>(`/api/v1/positions?accountId=${accountId}`),
  squareOffPosition: (positionId: string) =>
    request<{ positionId: string; orderId: string; message: string }>(
      `/api/v1/positions/${positionId}/square-off`,
      { method: 'POST' },
    ),
  getJournal: () => request<JournalEntry[]>('/api/v1/journal'),
  getHoldings: (accountId: string) =>
    request<Holding[]>(`/api/v1/holdings?accountId=${accountId}`),
  squareOffMis: () =>
    request<{ closed: number; message: string }>('/api/v1/admin/square-off-mis', { method: 'POST' }),

  getAlgos: () => request<AlgoSummary[]>('/api/v1/algos'),
  getAlgo: (id: string) => request<AlgoDetail>(`/api/v1/algos/${id}`),
  createAlgo: (data: { name: string; description?: string; sourceCode?: string }) =>
    request<AlgoSummary>('/api/v1/algos', { method: 'POST', body: JSON.stringify(data) }),
  updateAlgo: (
    id: string,
    data: { name?: string; description?: string; sourceCode?: string; status?: string },
  ) => request<AlgoSummary>(`/api/v1/algos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAlgo: (id: string) =>
    request<{ deleted: boolean }>(`/api/v1/algos/${id}`, { method: 'DELETE' }),
  backtestAlgo: (id: string, body: BacktestRequest) =>
    request<BacktestResult>(`/api/v1/algos/${id}/backtest`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deployAlgo: (id: string, body: DeployRequest) =>
    request<AlgoDeployment>(`/api/v1/algos/${id}/deploy`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  stopAlgo: (id: string) =>
    request<{ stopped: boolean }>(`/api/v1/algos/${id}/stop`, { method: 'POST', body: JSON.stringify({}) }),
  getAlgoLogs: (id: string, deploymentId?: string) => {
    const params = deploymentId ? `?deploymentId=${deploymentId}` : '';
    return request<AlgoLogEntry[]>(`/api/v1/algos/${id}/logs${params}`);
  },
  getAlgoSignals: (id: string) => request<AlgoSignalEntry[]>(`/api/v1/algos/${id}/signals`),
  killSwitch: () =>
    request<{ stopped: number; message: string }>('/api/v1/algos/kill-switch', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getBrokerConnections: () => request<BrokerConnection[]>('/api/v1/broker/connections'),
  connectBrokerSimulated: (brokerType: 'ZERODHA' | 'ANGEL_ONE' | 'UPSTOX' | 'FYERS' | 'DHANI') =>
    request<{ id: string; simulated: boolean; message: string }>('/api/v1/broker/connect', {
      method: 'POST',
      body: JSON.stringify({ brokerType, simulate: true }),
    }),
  disconnectBroker: (id: string) =>
    request<{ disconnected: boolean }>(`/api/v1/broker/connections/${id}`, { method: 'DELETE' }),
  getZerodhaLoginUrl: () =>
    request<{ loginUrl?: string; simulation?: boolean; message?: string }>(
      '/api/v1/broker/zerodha/login-url',
    ),
  completeZerodhaOAuth: (requestToken: string) =>
    request<{ id: string }>('/api/v1/broker/zerodha/callback', {
      method: 'POST',
      body: JSON.stringify({ requestToken }),
    }),
  getLivePortfolio: () =>
    request<LivePortfolio>('/api/v1/broker/live/portfolio'),
  getLiveBrokerOrders: () => request<BrokerOrderEntry[]>('/api/v1/broker/live/orders'),
  getAuditLog: (limit = 50) => request<AuditEntry[]>(`/api/v1/broker/audit?limit=${limit}`),
};

export function connectQuotes(onTick: (tick: QuoteTick) => void): WebSocket {
  const token = getToken();
  const ws = new WebSocket(`${WS_URL}?token=${token ?? ''}`);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data as string) as {
      channel?: string;
      event: string;
      data: QuoteTick | object;
    };
    if (msg.event === 'tick') onTick(msg.data as QuoteTick);
  };
  return ws;
}

export function connectAlgoEvents(
  deploymentId: string,
  onEvent: (event: string, data: object) => void,
): WebSocket {
  const token = getToken();
  const ws = new WebSocket(`${WS_URL}?token=${token ?? ''}`);
  ws.onopen = () => {
    ws.send(JSON.stringify({ action: 'subscribe_algo', deploymentId }));
  };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data as string) as {
      channel?: string;
      event: string;
      data: object;
    };
    if (msg.channel?.startsWith('algo:')) onEvent(msg.event, msg.data);
  };
  return ws;
}

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; name?: string };
  account: PaperAccount;
}

export interface MeResponse {
  id: string;
  email: string;
  name?: string;
  accounts: PaperAccount[];
}

export interface PaperAccount {
  id: string;
  name: string;
  startingBalance: string;
  currentBalance: string;
  riskPercent: string;
  rewardRatio: string;
  fundUsed: string;
  realizedProfit: string;
  realizedLoss: string;
  preferredMode?: 'PAPER' | 'LIVE';
}

export interface FundsResponse {
  available: number;
  used: number;
  total: number;
  realizedProfit: number;
  realizedLoss: number;
  unrealizedPL: number;
  riskPercent: number;
  rewardRatio: number;
}

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  segment: string;
  exchange: string;
  lotSize?: number;
  expiry?: string | null;
  instrumentType?: string;
}

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '1d';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  simulated?: boolean;
}

export interface WatchlistItem extends Instrument {
  ltp: number | null;
  prevClose: number | null;
}

export interface QuoteResponse {
  instrumentId: string;
  symbol: string;
  ltp: number | null;
  timestamp?: string;
}

export interface QuoteTick {
  instrumentId: string;
  symbol: string;
  ltp: number;
  volume: number;
  timestamp: string;
}

export interface PlaceOrderBody {
  paperAccountId: string;
  instrumentId: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  productType: 'CNC' | 'MIS' | 'NRML';
  mode?: 'PAPER' | 'LIVE';
  confirmLive?: boolean;
  quantity?: number;
  lots?: number;
  price?: number;
  stopLoss?: number;
  target?: number;
}

export interface Position {
  id: string;
  instrumentId: string;
  quantity: number;
  averagePrice: number;
  unrealizedPL: number;
  stopLoss: number | null;
  target: number | null;
  productType?: string;
  side?: string;
  instrument: Instrument;
}

export interface OrderEntry {
  id: string;
  side: string;
  orderType: string;
  productType: string;
  quantity: number;
  status: string;
  mode?: string;
  brokerOrderId?: string | null;
  price: number | null;
  averagePrice: number | null;
  createdAt: string;
  instrument: Instrument;
}

export interface JournalEntry {
  id: string;
  symbol: string;
  segment: string;
  rangeStart: number | null;
  rangeEnd: number | null;
  entryDate: string | null;
  entryPrice: number | null;
  stopLoss: number | null;
  target: number | null;
  quantity: number | null;
  expiry: string | null;
  ourEntry: number | null;
  ourExit: number | null;
  plPercent: number | null;
  plAmount: number | null;
  notes: string | null;
}

export interface Holding {
  id: string;
  quantity: number;
  averagePrice: number;
  instrument: Instrument;
}

export function productTypesForSegment(segment: string): Array<'CNC' | 'MIS' | 'NRML'> {
  if (segment === 'EQUITY') return ['CNC', 'MIS'];
  return ['NRML', 'MIS'];
}

export function defaultProductForSegment(segment: string): 'CNC' | 'MIS' | 'NRML' {
  return segment === 'EQUITY' ? 'CNC' : 'NRML';
}

export interface AlgoSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  deployments?: AlgoDeployment[];
}

export interface AlgoDetail extends AlgoSummary {
  sourceCode: string;
  deployments: AlgoDeployment[];
}

export interface AlgoDeployment {
  id: string;
  algoId: string;
  paperAccountId: string;
  mode: string;
  status: string;
  maxLoss: string | null;
  maxOrdersPerDay: number;
  startedAt: string;
  stoppedAt: string | null;
  config: {
    strategyType: string;
    instrumentId: string;
    fastPeriod: number;
    slowPeriod: number;
    quantity: number;
    productType: string;
  };
}

export interface BacktestRequest {
  instrumentId: string;
  days?: number;
  interval?: string;
  config: {
    strategyType: 'sma_crossover';
    fastPeriod?: number;
    slowPeriod?: number;
    quantity: number;
    productType?: 'CNC' | 'MIS' | 'NRML';
  };
}

export interface BacktestResult {
  trades: Array<{
    side: string;
    price: number;
    quantity: number;
    timestamp: string;
    pnl?: number;
  }>;
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  candleCount: number;
}

export interface DeployRequest {
  paperAccountId: string;
  instrumentId: string;
  config: {
    strategyType: 'sma_crossover';
    fastPeriod?: number;
    slowPeriod?: number;
    quantity: number;
    productType?: 'CNC' | 'MIS' | 'NRML';
  };
  maxLoss?: number;
  maxOrdersPerDay?: number;
}

export interface AlgoLogEntry {
  id: string;
  level: string;
  message: string;
  createdAt: string;
  algoDeploymentId: string;
}

export interface AlgoSignalEntry {
  id: string;
  signalType: string;
  price: string;
  reason: string | null;
  createdAt: string;
}

export interface BrokerConnection {
  id: string;
  brokerType: string;
  isActive: boolean;
  simulated: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface BrokerOrderEntry {
  brokerOrderId: string;
  status: string;
  message?: string;
  averagePrice?: number;
  filledQuantity?: number;
}

export interface LivePortfolio {
  positions: Array<{
    symbol: string;
    exchange: string;
    quantity: number;
    averagePrice: number;
    productType: string;
    pnl: number;
  }>;
  funds: { available: number; used: number; total: number };
  orders: BrokerOrderEntry[];
}

export interface AuditEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}
