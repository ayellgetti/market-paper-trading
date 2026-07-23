import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  api,
  clearToken,
  connectAlgoEvents,
  connectQuotes,
  defaultProductForSegment,
  getToken,
  productTypesForSegment,
  setToken,
  type AlgoDetail,
  type AlgoLogEntry,
  type AlgoSignalEntry,
  type AlgoSummary,
  type AuthResponse,
  type BacktestResult,
  type BrokerConnection,
  type BrokerOrderEntry,
  type FundsResponse,
  type Holding,
  type Instrument,
  type JournalEntry,
  type OrderEntry,
  type Position,
  type QuoteTick,
  type Segment,
  type TradeLogEntry,
} from './api/client';
import './styles.css';
import { AdminLayout, pageTitleForNav, type NavPage } from './AdminLayout';

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN');
}

function AuthScreen({ onAuth }: { onAuth: (res: AuthResponse) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = isRegister
        ? await api.register(email, password, name || undefined)
        : await api.login(email, password);
      setToken(res.token);
      onAuth(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Paper Trading Platform</h1>
        <p className="subtitle">Learn trading safely before the real market</p>
        <form onSubmit={submit}>
          {isRegister && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Please wait...' : isRegister ? 'Register' : 'Login'}
          </button>
        </form>
        <button type="button" className="link-btn" onClick={() => setIsRegister(!isRegister)}>
          {isRegister ? 'Already have an account? Login' : 'New user? Register'}
        </button>
      </div>
    </div>
  );
}

function TradingDashboard({
  auth,
  page,
  tradingMode,
}: {
  auth: AuthResponse;
  page: Exclude<NavPage, 'algos'>;
  tradingMode: 'PAPER' | 'LIVE';
}) {
  const accountId = auth.account.id;
  const [funds, setFunds] = useState<FundsResponse | null>(null);
  const [riskPercent, setRiskPercent] = useState(Number(auth.account.riskPercent));
  const [rewardRatio, setRewardRatio] = useState(Number(auth.account.rewardRatio));
  const [segmentFilter, setSegmentFilter] = useState<Segment>('ALL');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [ltp, setLtp] = useState<number | null>(null);
  const [lots, setLots] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [price, setPrice] = useState('');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [productType, setProductType] = useState<'CNC' | 'MIS' | 'NRML'>('CNC');
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<OrderEntry[]>([]);
  const [trades, setTrades] = useState<TradeLogEntry[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [message, setMessage] = useState('');
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [brokerConnections, setBrokerConnections] = useState<BrokerConnection[]>([]);
  const [liveBrokerOrders, setLiveBrokerOrders] = useState<BrokerOrderEntry[]>([]);

  const isDerivative = selected != null && selected.segment !== 'EQUITY';
  const activeBroker = brokerConnections.find((c) => c.isActive);

  const refreshBrokers = useCallback(async () => {
    try {
      const conns = await api.getBrokerConnections();
      setBrokerConnections(conns);
      if (conns.some((c) => c.isActive) && tradingMode === 'LIVE') {
        const liveOrders = await api.getLiveBrokerOrders();
        setLiveBrokerOrders(liveOrders);
      }
    } catch {
      setBrokerConnections([]);
    }
  }, [tradingMode]);

  const refresh = useCallback(async () => {
    const [f, p, t, o, j, h] = await Promise.all([
      api.getFunds(accountId),
      api.getPositions(accountId),
      api.getTrades(),
      api.getOrders(),
      api.getJournal(),
      api.getHoldings(accountId),
    ]);
    setFunds(f);
    setPositions(p);
    setTrades(t);
    setOrders(o);
    setJournal(j);
    setHoldings(h);
  }, [accountId]);

  useEffect(() => {
    void refresh();
    void refreshBrokers();
    const interval = setInterval(() => {
      void refresh();
      void refreshBrokers();
    }, 5000);
    return () => clearInterval(interval);
  }, [refresh, refreshBrokers]);

  useEffect(() => {
    const ws = connectQuotes((tick: QuoteTick) => {
      setQuotes((prev) => ({ ...prev, [tick.instrumentId]: tick.ltp }));
      if (selected?.id === tick.instrumentId) setLtp(tick.ltp);
    });
    return () => ws.close();
  }, [selected?.id]);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void api
        .searchInstruments(search, segmentFilter)
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, segmentFilter]);

  const selectInstrument = async (inst: Instrument) => {
    setSelected(inst);
    setSearch(inst.symbol);
    setResults([]);
    setProductType(defaultProductForSegment(inst.segment));
    if (inst.lotSize && inst.lotSize > 1) setLots(1);
    try {
      const quote = await api.getQuote(inst.id);
      setLtp(quote.ltp);
    } catch {
      setLtp(null);
    }
  };

  const saveRiskSettings = async () => {
    await api.updateAccount(accountId, { riskPercent, rewardRatio });
    await refresh();
    setMessage('Risk settings saved');
  };

  const placeOrder = async (side: 'BUY' | 'SELL') => {
    if (!selected) return;
    if (tradingMode === 'LIVE') {
      const ok = window.confirm(
        `Place LIVE ${side} order for ${selected.symbol}? This routes to your connected broker and may use real funds.`,
      );
      if (!ok) return;
    }
    setMessage('');
    try {
      await api.placeOrder({
        paperAccountId: accountId,
        instrumentId: selected.id,
        side,
        orderType,
        productType,
        mode: tradingMode,
        confirmLive: tradingMode === 'LIVE' ? true : undefined,
        ...(isDerivative ? { lots } : { quantity }),
        price: orderType === 'LIMIT' && price ? Number(price) : undefined,
        stopLoss: stopLoss ? Number(stopLoss) : undefined,
        target: target ? Number(target) : undefined,
      });
      setMessage(`${tradingMode} ${side} order placed for ${selected.symbol}`);
      await refresh();
      await refreshBrokers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Order failed');
    }
  };

  const connectZerodhaSim = async () => {
    try {
      const res = await api.connectBrokerSimulated('ZERODHA');
      setMessage(res.message);
      await refreshBrokers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Connect failed');
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      await api.cancelOrder(orderId);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Cancel failed');
    }
  };

  const riskAmount = funds ? (funds.available + funds.used) * (riskPercent / 100) : 0;
  const rewardAmount = riskAmount * rewardRatio;

  return (
    <div className="page-content">
      {message && (
        <div className={`toast ${message.toLowerCase().includes('fail') ? 'toast-error' : 'toast-success'}`}>
          {message}
        </div>
      )}

      {page === 'broker' && (
        <section className="panel broker-panel">
          <h2>Broker Connection</h2>
          <div className="broker-row">
            {activeBroker ? (
              <p className="success">
                Connected: {activeBroker.brokerType}
                {activeBroker.simulated ? ' (simulated)' : ''}
              </p>
            ) : (
              <p className="empty-inline">No broker connected — required for LIVE mode</p>
            )}
            <button type="button" onClick={() => void connectZerodhaSim()}>Connect Zerodha (Demo)</button>
            {activeBroker && (
              <button
                type="button"
                className="btn-sm"
                onClick={() => void api.disconnectBroker(activeBroker.id).then(() => refreshBrokers())}
              >
                Disconnect
              </button>
            )}
          </div>
          {tradingMode === 'LIVE' && liveBrokerOrders.length > 0 && (
            <div className="broker-orders">
              <h3>Broker Order Book</h3>
              <table>
                <thead>
                  <tr>
                    <th>Broker ID</th>
                    <th>Status</th>
                    <th>Filled</th>
                    <th>Avg Price</th>
                  </tr>
                </thead>
                <tbody>
                  {liveBrokerOrders.slice(0, 10).map((o) => (
                    <tr key={o.brokerOrderId}>
                      <td>{o.brokerOrderId}</td>
                      <td>{o.status}</td>
                      <td>{o.filledQuantity ?? '—'}</td>
                      <td>{o.averagePrice != null ? formatINR(o.averagePrice) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {page === 'trade' && (
        <>
          <section className="panel account-panel">
            <h2>Account & Risk</h2>
            <div className="grid-3">
              <div className="stat-card">
                <label>Available Balance</label>
                <div className="value">{funds ? formatINR(funds.available) : '—'}</div>
              </div>
              <div className="stat-card">
                <label>Fund Used</label>
                <div className="value">{funds ? formatINR(funds.used) : '—'}</div>
              </div>
              <div className="stat-card">
                <label>Unrealized P/L</label>
                <div className={`value ${funds && funds.unrealizedPL < 0 ? 'loss' : 'profit'}`}>
                  {funds ? formatINR(funds.unrealizedPL) : '—'}
                </div>
              </div>
              <div>
                <label>Risk % ({formatINR(riskAmount)})</label>
                <input type="number" value={riskPercent} onChange={(e) => setRiskPercent(Number(e.target.value))} step="0.1" />
              </div>
              <div>
                <label>Reward ({formatINR(rewardAmount)})</label>
                <input type="number" value={rewardRatio} onChange={(e) => setRewardRatio(Number(e.target.value))} step="0.1" />
              </div>
              <div className="actions">
                <button type="button" onClick={() => void saveRiskSettings()}>Save Settings</button>
              </div>
            </div>
          </section>

          <div className="grid-2">
            <section className="panel">
              <h2>Search Instrument</h2>
              <label>
                Segment
                <select value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value as Segment)}>
                  <option value="ALL">All Segments</option>
                  <option value="EQUITY">Equity</option>
                  <option value="FNO">F&O</option>
                  <option value="COMMODITY">Commodity</option>
                  <option value="CURRENCY">Currency</option>
                </select>
              </label>
              <input
                placeholder="Search (e.g. RELIANCE, NIFTY)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {results.length > 0 && (
                <ul className="search-results">
                  {results.map((inst) => (
                    <li key={inst.id}>
                      <button type="button" onClick={() => void selectInstrument(inst)}>
                        <strong>{inst.symbol}</strong>
                        <span className="segment-tag">{inst.segment}</span>
                        <span className="inst-name">{inst.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {selected && (
              <section className="panel order-panel">
                <div className="order-header">
                  <div>
                    <h2>{selected.symbol}</h2>
                    <span className="segment-tag">{selected.segment}</span>
                    {selected.expiry && (
                      <span className="expiry-tag">Exp: {formatDate(selected.expiry)}</span>
                    )}
                  </div>
                  <div className="ltp">
                    LTP: {ltp != null ? formatINR(ltp) : '—'}
                    {quotes[selected.id] != null && <span className="live-dot" title="Live" />}
                  </div>
                  <div className="order-actions">
                    <button type="button" className="btn-buy" onClick={() => void placeOrder('BUY')}>Buy</button>
                    <button type="button" className="btn-sell" onClick={() => void placeOrder('SELL')}>Sell</button>
                  </div>
                </div>
                <div className="grid-4">
                  <label>
                    Order Type
                    <select value={orderType} onChange={(e) => setOrderType(e.target.value as 'MARKET' | 'LIMIT')}>
                      <option value="MARKET">Market</option>
                      <option value="LIMIT">Limit</option>
                    </select>
                  </label>
                  <label>
                    Product
                    <select
                      value={productType}
                      onChange={(e) => setProductType(e.target.value as 'CNC' | 'MIS' | 'NRML')}
                    >
                      {productTypesForSegment(selected.segment).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  {isDerivative ? (
                    <label>
                      Lots (×{selected.lotSize ?? 1})
                      <input type="number" min={1} value={lots} onChange={(e) => setLots(Number(e.target.value))} />
                    </label>
                  ) : (
                    <label>
                      Quantity
                      <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
                    </label>
                  )}
                  {orderType === 'LIMIT' && (
                    <label>
                      Limit Price
                      <input value={price} onChange={(e) => setPrice(e.target.value)} />
                    </label>
                  )}
                  <label>
                    Stop Loss
                    <input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
                  </label>
                  <label>
                    Target
                    <input value={target} onChange={(e) => setTarget(e.target.value)} />
                  </label>
                </div>
              </section>
            )}
          </div>
        </>
      )}

      {page === 'positions' && (
        <section className="panel">
          <h2>Positions</h2>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Segment</th>
                <th>Product</th>
                <th>Avg Price</th>
                <th>Qty</th>
                <th>LTP</th>
                <th>Unrealized P/L</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr><td colSpan={7} className="empty">No open positions</td></tr>
              ) : (
                positions.map((p) => (
                  <tr key={p.id}>
                    <td>{p.instrument.symbol}</td>
                    <td>{p.instrument.segment}</td>
                    <td>{p.productType}</td>
                    <td>{formatINR(p.averagePrice)}</td>
                    <td>{p.quantity}</td>
                    <td>{quotes[p.instrumentId] != null ? formatINR(quotes[p.instrumentId]) : '—'}</td>
                    <td className={p.unrealizedPL < 0 ? 'loss' : 'profit'}>{formatINR(p.unrealizedPL)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {page === 'orders' && (
        <section className="panel">
          <h2>Order Book</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Symbol</th>
                <th>Segment</th>
                <th>Side</th>
                <th>Type</th>
                <th>Product</th>
                <th>Mode</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={11} className="empty">No orders</td></tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id}>
                    <td>{new Date(o.createdAt).toLocaleString('en-IN')}</td>
                    <td>{o.instrument.symbol}</td>
                    <td>{o.instrument.segment}</td>
                    <td>{o.side}</td>
                    <td>{o.orderType}</td>
                    <td>{o.productType}</td>
                    <td><span className={`status status-${(o.mode ?? 'PAPER').toLowerCase()}`}>{o.mode ?? 'PAPER'}</span></td>
                    <td>{o.quantity}</td>
                    <td>{o.averagePrice != null ? formatINR(o.averagePrice) : o.price != null ? formatINR(o.price) : '—'}</td>
                    <td><span className={`status status-${o.status.toLowerCase()}`}>{o.status}</span></td>
                    <td>
                      {(o.status === 'OPEN' || o.status === 'PENDING') && (
                        <button type="button" className="btn-sm" onClick={() => void cancelOrder(o.id)}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {page === 'trades' && (
        <section className="panel">
          <h2>Trade Log</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Stock</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr><td colSpan={6} className="empty">No trades yet</td></tr>
              ) : (
                trades.map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.datetime).toLocaleString('en-IN')}</td>
                    <td>{t.action}</td>
                    <td>{t.stock}</td>
                    <td>{t.quantity}</td>
                    <td>{formatINR(t.price)}</td>
                    <td>{formatINR(t.totalCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {page === 'journal' && (
        <section className="panel journal-panel">
          <h2>Trade Journal (Univest Style)</h2>
          <div className="table-scroll">
            <table className="journal-table">
              <thead>
                <tr>
                  <th colSpan={2}></th>
                  <th colSpan={2}>Range</th>
                  <th colSpan={2}>Entry</th>
                  <th colSpan={2}>Exit</th>
                  <th colSpan={2}></th>
                  <th colSpan={4}>Our</th>
                </tr>
                <tr>
                  <th>Symbol</th>
                  <th>Segment</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Date</th>
                  <th>Price</th>
                  <th>Stoploss</th>
                  <th>Target</th>
                  <th>Qty</th>
                  <th>Expiry</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>P/L</th>
                  <th>P/L Amt</th>
                </tr>
              </thead>
              <tbody>
                {journal.length === 0 ? (
                  <tr><td colSpan={14} className="empty">No journal entries</td></tr>
                ) : (
                  journal.map((j) => (
                    <tr key={j.id}>
                      <td>{j.symbol}</td>
                      <td>{j.segment}</td>
                      <td>{j.rangeStart != null ? formatINR(j.rangeStart) : '—'}</td>
                      <td>{j.rangeEnd != null ? formatINR(j.rangeEnd) : '—'}</td>
                      <td>{formatDate(j.entryDate)}</td>
                      <td>{j.entryPrice != null ? formatINR(j.entryPrice) : '—'}</td>
                      <td>{j.stopLoss != null ? formatINR(j.stopLoss) : '—'}</td>
                      <td>{j.target != null ? formatINR(j.target) : '—'}</td>
                      <td>{j.quantity ?? '—'}</td>
                      <td>{formatDate(j.expiry)}</td>
                      <td>{j.ourEntry != null ? formatINR(j.ourEntry) : '—'}</td>
                      <td>{j.ourExit != null ? formatINR(j.ourExit) : '—'}</td>
                      <td className={j.plPercent != null && j.plPercent < 0 ? 'loss' : 'profit'}>
                        {j.plPercent != null ? `${j.plPercent.toFixed(2)}%` : '—'}
                      </td>
                      <td className={j.plAmount != null && j.plAmount < 0 ? 'loss' : 'profit'}>
                        {j.plAmount != null ? formatINR(j.plAmount) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {page === 'holdings' && (
        <section className="panel">
          <h2>Holdings (Delivery)</h2>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Segment</th>
                <th>Quantity</th>
                <th>Avg Price</th>
                <th>LTP</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {holdings.length === 0 ? (
                <tr><td colSpan={6} className="empty">No holdings — CNC positions settle T+1</td></tr>
              ) : (
                holdings.map((h) => {
                  const ltpNow = quotes[h.instrument.id];
                  return (
                    <tr key={h.id}>
                      <td>{h.instrument.symbol}</td>
                      <td>{h.instrument.segment}</td>
                      <td>{h.quantity}</td>
                      <td>{formatINR(h.averagePrice)}</td>
                      <td>{ltpNow != null ? formatINR(ltpNow) : '—'}</td>
                      <td>{ltpNow != null ? formatINR(ltpNow * h.quantity) : '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function AlgoStudio({ auth }: { auth: AuthResponse }) {
  const accountId = auth.account.id;
  const [algos, setAlgos] = useState<AlgoSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [algo, setAlgo] = useState<AlgoDetail | null>(null);
  const [sourceCode, setSourceCode] = useState('');
  const [name, setName] = useState('');
  const [search, setSearch] = useState('RELIANCE');
  const [results, setResults] = useState<Instrument[]>([]);
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [fastPeriod, setFastPeriod] = useState(9);
  const [slowPeriod, setSlowPeriod] = useState(21);
  const [quantity, setQuantity] = useState(10);
  const [productType, setProductType] = useState<'CNC' | 'MIS' | 'NRML'>('MIS');
  const [maxLoss, setMaxLoss] = useState('');
  const [maxOrders, setMaxOrders] = useState(50);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [logs, setLogs] = useState<AlgoLogEntry[]>([]);
  const [signals, setSignals] = useState<AlgoSignalEntry[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    const list = await api.getAlgos();
    setAlgos(list);
  }, []);

  const loadAlgo = useCallback(async (id: string) => {
    const detail = await api.getAlgo(id);
    setAlgo(detail);
    setSelectedId(id);
    setSourceCode(detail.sourceCode);
    setName(detail.name);
    const dep = detail.deployments.find((d) => d.status === 'DEPLOYED');
    setActiveDeploymentId(dep?.id ?? detail.deployments[0]?.id ?? null);
    if (dep?.config) {
      setFastPeriod(dep.config.fastPeriod);
      setSlowPeriod(dep.config.slowPeriod);
      setQuantity(dep.config.quantity);
      setProductType(dep.config.productType as 'CNC' | 'MIS' | 'NRML');
    }
    const [l, s] = await Promise.all([api.getAlgoLogs(id), api.getAlgoSignals(id)]);
    setLogs(l);
    setSignals(s);
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void api
        .searchInstruments(search, 'EQUITY')
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!activeDeploymentId || !selectedId) return;
    const ws = connectAlgoEvents(activeDeploymentId, (event, data) => {
      if (event === 'log') {
        const log = data as { level: string; message: string };
        setLogs((prev) => [
          {
            id: crypto.randomUUID(),
            algoDeploymentId: activeDeploymentId,
            level: log.level,
            message: log.message,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      if (event === 'signal') {
        const sig = data as { signalType: string; price: number; reason: string };
        setSignals((prev) => [
          {
            id: crypto.randomUUID(),
            signalType: sig.signalType,
            price: String(sig.price),
            reason: sig.reason,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    });
    return () => ws.close();
  }, [activeDeploymentId, selectedId]);

  const createAlgo = async () => {
    setMessage('');
    try {
      const created = await api.createAlgo({ name: 'SMA Crossover', description: 'Phase 3 template' });
      await refreshList();
      await loadAlgo(created.id);
      setMessage('Algo created');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const saveAlgo = async () => {
    if (!selectedId) return;
    setMessage('');
    try {
      await api.updateAlgo(selectedId, { name, sourceCode });
      setMessage('Saved');
      await refreshList();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const runBacktest = async () => {
    if (!selectedId || !instrument) {
      setMessage('Select an instrument first');
      return;
    }
    setLoading(true);
    setMessage('');
    setBacktest(null);
    try {
      const result = await api.backtestAlgo(selectedId, {
        instrumentId: instrument.id,
        days: 30,
        interval: '5m',
        config: {
          strategyType: 'sma_crossover',
          fastPeriod,
          slowPeriod,
          quantity,
          productType,
        },
      });
      setBacktest(result);
      setMessage(`Backtest done — ${result.candleCount} candles, P/L ${formatINR(result.totalPnL)}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  const deploy = async () => {
    if (!selectedId || !instrument) {
      setMessage('Select an instrument first');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const dep = await api.deployAlgo(selectedId, {
        paperAccountId: accountId,
        instrumentId: instrument.id,
        config: {
          strategyType: 'sma_crossover',
          fastPeriod,
          slowPeriod,
          quantity,
          productType,
        },
        maxLoss: maxLoss ? Number(maxLoss) : undefined,
        maxOrdersPerDay: maxOrders,
      });
      setActiveDeploymentId(dep.id);
      setMessage(`Deployed — deployment ${dep.id.slice(0, 8)}…`);
      await loadAlgo(selectedId);
      await refreshList();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Deploy failed');
    } finally {
      setLoading(false);
    }
  };

  const stop = async () => {
    if (!selectedId) return;
    try {
      await api.stopAlgo(selectedId);
      setMessage('Algo stopped');
      await loadAlgo(selectedId);
      await refreshList();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Stop failed');
    }
  };

  const selectInstrument = (inst: Instrument) => {
    setInstrument(inst);
    setSearch(inst.symbol);
    setResults([]);
    setProductType(defaultProductForSegment(inst.segment) === 'CNC' ? 'MIS' : 'MIS');
  };

  return (
    <div className="page-content algo-studio">
      <div className="algo-layout">
        <aside className="panel algo-list">
          <div className="algo-list-header">
            <h2>Strategies</h2>
            <button type="button" onClick={() => void createAlgo()}>+ New</button>
          </div>
          <ul className="algo-items">
            {algos.length === 0 ? (
              <li className="empty-item">No algos yet</li>
            ) : (
              algos.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={selectedId === a.id ? 'algo-item active' : 'algo-item'}
                    onClick={() => void loadAlgo(a.id)}
                  >
                    <strong>{a.name}</strong>
                    <span className={`status status-${a.status.toLowerCase()}`}>{a.status}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <main className="algo-main">
          {!algo ? (
            <section className="panel">
              <p className="empty">Create or select a strategy to begin</p>
            </section>
          ) : (
            <>
              <section className="panel">
                <div className="algo-toolbar">
                  <label>
                    Name
                    <input value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <button type="button" onClick={() => void saveAlgo()}>Save</button>
                  <button type="button" onClick={() => void runBacktest()} disabled={loading}>
                    {loading ? 'Running…' : 'Backtest (30d 5m)'}
                  </button>
                  <button type="button" className="btn-buy" onClick={() => void deploy()} disabled={loading}>
                    Deploy Paper
                  </button>
                  <button type="button" className="btn-sell" onClick={() => void stop()}>
                    Stop
                  </button>
                </div>
                {message && (
                  <p className={message.toLowerCase().includes('fail') ? 'error' : 'success'}>{message}</p>
                )}
              </section>

              <div className="grid-2 algo-editor-grid">
                <section className="panel">
                  <h2>Strategy Code</h2>
                  <textarea
                    className="code-editor"
                    value={sourceCode}
                    onChange={(e) => setSourceCode(e.target.value)}
                    spellCheck={false}
                  />
                </section>

                <section className="panel">
                  <h2>Deploy Config</h2>
                  <label>
                    Instrument
                    <input
                      placeholder="Search RELIANCE"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  {results.length > 0 && (
                    <ul className="search-results">
                      {results.map((inst) => (
                        <li key={inst.id}>
                          <button type="button" onClick={() => selectInstrument(inst)}>
                            <strong>{inst.symbol}</strong>
                            <span className="inst-name">{inst.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {instrument && <p className="selected-inst">Selected: <strong>{instrument.symbol}</strong></p>}
                  <div className="grid-2">
                    <label>
                      Fast SMA
                      <input type="number" min={2} value={fastPeriod} onChange={(e) => setFastPeriod(Number(e.target.value))} />
                    </label>
                    <label>
                      Slow SMA
                      <input type="number" min={3} value={slowPeriod} onChange={(e) => setSlowPeriod(Number(e.target.value))} />
                    </label>
                    <label>
                      Quantity
                      <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
                    </label>
                    <label>
                      Product
                      <select value={productType} onChange={(e) => setProductType(e.target.value as 'CNC' | 'MIS' | 'NRML')}>
                        <option value="MIS">MIS</option>
                        <option value="CNC">CNC</option>
                        <option value="NRML">NRML</option>
                      </select>
                    </label>
                    <label>
                      Max Loss (₹)
                      <input value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} placeholder="Optional" />
                    </label>
                    <label>
                      Max Orders/Day
                      <input type="number" min={1} value={maxOrders} onChange={(e) => setMaxOrders(Number(e.target.value))} />
                    </label>
                  </div>
                </section>
              </div>

              {backtest && (
                <section className="panel">
                  <h2>Backtest Results</h2>
                  <div className="grid-4 backtest-stats">
                    <div>
                      <label>Candles</label>
                      <div className="value">{backtest.candleCount}</div>
                    </div>
                    <div>
                      <label>Total Trades</label>
                      <div className="value">{backtest.totalTrades}</div>
                    </div>
                    <div>
                      <label>Win Rate</label>
                      <div className="value">{backtest.winRate.toFixed(1)}%</div>
                    </div>
                    <div>
                      <label>Total P/L</label>
                      <div className={`value ${backtest.totalPnL < 0 ? 'loss' : 'profit'}`}>
                        {formatINR(backtest.totalPnL)}
                      </div>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Side</th>
                        <th>Price</th>
                        <th>Qty</th>
                        <th>P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backtest.trades.slice(-20).map((t, i) => (
                        <tr key={i}>
                          <td>{new Date(t.timestamp).toLocaleString('en-IN')}</td>
                          <td>{t.side}</td>
                          <td>{formatINR(t.price)}</td>
                          <td>{t.quantity}</td>
                          <td className={t.pnl != null && t.pnl < 0 ? 'loss' : 'profit'}>
                            {t.pnl != null ? formatINR(t.pnl) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              <div className="grid-2">
                <section className="panel">
                  <h2>Live Logs</h2>
                  <div className="log-stream">
                    {logs.length === 0 ? (
                      <p className="empty">No logs yet — deploy to start</p>
                    ) : (
                      logs.slice(0, 50).map((l) => (
                        <div key={l.id} className={`log-line log-${l.level.toLowerCase()}`}>
                          <span className="log-time">{new Date(l.createdAt).toLocaleTimeString('en-IN')}</span>
                          <span className="log-level">{l.level}</span>
                          <span>{l.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="panel">
                  <h2>Signals</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Signal</th>
                        <th>Price</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signals.length === 0 ? (
                        <tr><td colSpan={4} className="empty">No signals yet</td></tr>
                      ) : (
                        signals.slice(0, 30).map((s) => (
                          <tr key={s.id}>
                            <td>{new Date(s.createdAt).toLocaleString('en-IN')}</td>
                            <td>{s.signalType}</td>
                            <td>{formatINR(Number(s.price))}</td>
                            <td>{s.reason ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </section>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function AppShell({ auth, onLogout }: { auth: AuthResponse; onLogout: () => void }) {
  const accountId = auth.account.id;
  const [activeNav, setActiveNav] = useState<NavPage>('trade');
  const [tradingMode, setTradingMode] = useState<'PAPER' | 'LIVE'>(auth.account.preferredMode ?? 'PAPER');
  const [funds, setFunds] = useState<FundsResponse | null>(null);
  const [brokerConnections, setBrokerConnections] = useState<BrokerConnection[]>([]);

  const activeBroker = brokerConnections.find((c) => c.isActive);

  const refreshFunds = useCallback(async () => {
    try {
      const f = await api.getFunds(accountId);
      setFunds(f);
    } catch {
      setFunds(null);
    }
  }, [accountId]);

  const refreshBrokers = useCallback(async () => {
    try {
      setBrokerConnections(await api.getBrokerConnections());
    } catch {
      setBrokerConnections([]);
    }
  }, []);

  useEffect(() => {
    void refreshFunds();
    void refreshBrokers();
    const interval = setInterval(() => {
      void refreshFunds();
      void refreshBrokers();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshFunds, refreshBrokers]);

  const switchTradingMode = async (mode: 'PAPER' | 'LIVE') => {
    if (mode === 'LIVE') {
      if (!activeBroker) {
        setActiveNav('broker');
        return;
      }
      const ok = window.confirm(
        'Enable LIVE trading? Orders will route to your broker. Real money may be at risk.',
      );
      if (!ok) return;
    }
    await api.updateAccount(accountId, { preferredMode: mode, confirmLive: mode === 'LIVE' });
    setTradingMode(mode);
  };

  const killAllAlgos = async () => {
    await api.killSwitch();
  };

  return (
    <AdminLayout
      auth={auth}
      activeNav={activeNav}
      onNavChange={setActiveNav}
      onLogout={onLogout}
      tradingMode={tradingMode}
      onModeChange={(mode) => void switchTradingMode(mode)}
      funds={funds}
      pageTitle={pageTitleForNav(activeNav)}
      headerActions={
        activeNav === 'algos' ? (
          <button type="button" className="btn-danger btn-sm" onClick={() => void killAllAlgos()}>
            Kill Switch
          </button>
        ) : null
      }
    >
      {activeNav === 'algos' ? (
        <AlgoStudio auth={auth} />
      ) : (
        <TradingDashboard auth={auth} page={activeNav} tradingMode={tradingMode} />
      )}
    </AdminLayout>
  );
}

function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    void api
      .me()
      .then((me) => {
        setAuth({
          token,
          user: { id: me.id, email: me.email, name: me.name },
          account: me.accounts[0],
        });
      })
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading...</div>;
  if (!auth) return <AuthScreen onAuth={setAuth} />;
  return (
    <AppShell
      auth={auth}
      onLogout={() => {
        clearToken();
        window.location.reload();
      }}
    />
  );
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
