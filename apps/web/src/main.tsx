import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeToggle } from './theme';
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
  type CandleInterval,
  type FundsResponse,
  type Holding,
  type Instrument,
  type JournalEntry,
  type OrderEntry,
  type Position,
  type QuoteTick,
  type Segment,
  type WatchlistItem,
} from './api/client';
import './styles.css';
import { INTERVALS, PriceChart } from './PriceChart';
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

/** Intraday price-band risk template (suggested stop & 1.5R target). */
const INTRADAY_RISK_BANDS: Array<{
  min: number;
  max: number;
  label: string;
  stopPercent: number;
  targetPercent: number;
}> = [
  { min: 0, max: 100, label: '₹0–100', stopPercent: 2.0, targetPercent: 3.0 },
  { min: 100, max: 200, label: '₹100–200', stopPercent: 2.0, targetPercent: 3.0 },
  { min: 200, max: 300, label: '₹200–300', stopPercent: 1.5, targetPercent: 2.25 },
  { min: 300, max: 400, label: '₹300–400', stopPercent: 1.5, targetPercent: 2.25 },
  { min: 400, max: 500, label: '₹400–500', stopPercent: 1.5, targetPercent: 2.25 },
  { min: 500, max: 1000, label: '₹500–1,000', stopPercent: 1.0, targetPercent: 1.5 },
  { min: 1000, max: 1500, label: '₹1,000–1,500', stopPercent: 0.75, targetPercent: 1.125 },
  { min: 1500, max: 2000, label: '₹1,500–2,000', stopPercent: 0.75, targetPercent: 1.125 },
  { min: 2000, max: 3000, label: '₹2,000–3,000', stopPercent: 0.75, targetPercent: 1.125 },
  { min: 3000, max: 4000, label: '₹3,000–4,000', stopPercent: 0.5, targetPercent: 0.75 },
  { min: 4000, max: 5000, label: '₹4,000–5,000', stopPercent: 0.5, targetPercent: 0.75 },
  { min: 5000, max: 10000, label: '₹5,000–10,000', stopPercent: 0.5, targetPercent: 0.75 },
  { min: 10000, max: 20000, label: '₹10,000–20,000', stopPercent: 0.5, targetPercent: 0.75 },
  { min: 20000, max: 100000, label: '₹20,000–100,000', stopPercent: 0.5, targetPercent: 0.75 },
];

function lookupIntradayRisk(entry: number) {
  const band =
    INTRADAY_RISK_BANDS.find((b) => entry >= b.min && entry < b.max) ??
    INTRADAY_RISK_BANDS[INTRADAY_RISK_BANDS.length - 1];
  return band;
}

type RiskLevels = {
  stopPercent: number;
  targetPercent: number;
  riskPerUnit: number;
  rewardPerUnit: number;
  stopLoss: number;
  target: number;
  bandLabel: string;
  source: 'intraday-table' | 'settings';
};

function calcRiskLevels(
  side: 'BUY' | 'SELL',
  entry: number,
  opts: { productType: 'CNC' | 'MIS' | 'NRML'; riskPercent: number; rewardRatio: number },
): RiskLevels | null {
  if (entry <= 0) return null;

  let stopPercent: number;
  let targetPercent: number;
  let bandLabel: string;
  let source: RiskLevels['source'];

  if (opts.productType === 'MIS') {
    const band = lookupIntradayRisk(entry);
    stopPercent = band.stopPercent;
    targetPercent = band.targetPercent;
    bandLabel = band.label;
    source = 'intraday-table';
  } else {
    if (opts.riskPercent <= 0) return null;
    stopPercent = opts.riskPercent;
    targetPercent = opts.riskPercent * opts.rewardRatio;
    bandLabel = 'Settings';
    source = 'settings';
  }

  const riskPerUnit = entry * (stopPercent / 100);
  const rewardPerUnit = entry * (targetPercent / 100);

  if (side === 'BUY') {
    return {
      stopPercent,
      targetPercent,
      riskPerUnit,
      rewardPerUnit,
      stopLoss: Math.max(0.05, entry - riskPerUnit),
      target: entry + rewardPerUnit,
      bandLabel,
      source,
    };
  }
  return {
    stopPercent,
    targetPercent,
    riskPerUnit,
    rewardPerUnit,
    stopLoss: entry + riskPerUnit,
    target: Math.max(0.05, entry - rewardPerUnit),
    bandLabel,
    source,
  };
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
  const [accountAmount, setAccountAmount] = useState(Number(auth.account.startingBalance));
  const [riskPercent, setRiskPercent] = useState(Number(auth.account.riskPercent));
  const [rewardRatio, setRewardRatio] = useState(Number(auth.account.rewardRatio));
  const [segmentFilter] = useState<Segment>('ALL');
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
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [message, setMessage] = useState('');
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [brokerConnections, setBrokerConnections] = useState<BrokerConnection[]>([]);
  const [liveBrokerOrders, setLiveBrokerOrders] = useState<BrokerOrderEntry[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [chartInterval, setChartInterval] = useState<CandleInterval>('5m');
  const [bottomTab, setBottomTab] = useState<'positions' | 'holdings' | 'orders'>('positions');
  const [liveTick, setLiveTick] = useState<{ ltp: number; ts: number } | null>(null);
  const [ohlc, setOhlc] = useState<{ open: number; high: number; low: number; close: number } | null>(null);

  const isDerivative = selected != null && selected.segment !== 'EQUITY';
  const activeBroker = brokerConnections.find((c) => c.isActive);
  const entryPrice =
    orderType === 'LIMIT' && price ? Number(price) : ltp != null ? ltp : null;

  const calcLevels = useCallback(
    (side: 'BUY' | 'SELL', entry: number) =>
      calcRiskLevels(side, entry, { productType, riskPercent, rewardRatio }),
    [productType, riskPercent, rewardRatio],
  );

  const previewLevels =
    entryPrice != null && entryPrice > 0 ? calcLevels('BUY', entryPrice) : null;

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
    const [f, p, o, j, h] = await Promise.all([
      api.getFunds(accountId),
      api.getPositions(accountId),
      api.getOrders(),
      api.getJournal(),
      api.getHoldings(accountId),
    ]);
    setFunds(f);
    setPositions(p);
    setOrders(o);
    setJournal(j);
    setHoldings(h);
    return f;
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
      if (selected?.id === tick.instrumentId) {
        setLtp(tick.ltp);
        setLiveTick({ ltp: tick.ltp, ts: Date.parse(tick.timestamp) || Date.now() });
      }
    });
    return () => ws.close();
  }, [selected?.id]);

  useEffect(() => {
    if (page !== 'trade') return;
    void api
      .getWatchlist()
      .then((items) => {
        setWatchlist(items);
        if (!selected && items.length > 0) {
          const first = items.find((i) => i.symbol === 'RELIANCE') ?? items[0];
          void selectInstrument(first);
        }
      })
      .catch(() => setWatchlist([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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

  useEffect(() => {
    if (!selected || entryPrice == null || entryPrice <= 0) {
      setStopLoss('');
      setTarget('');
      return;
    }
    const levels = calcLevels('BUY', entryPrice);
    if (!levels) {
      setStopLoss('');
      setTarget('');
      return;
    }
    setStopLoss(levels.stopLoss.toFixed(2));
    setTarget(levels.target.toFixed(2));
  }, [selected, entryPrice, calcLevels]);

  const selectInstrument = async (inst: Instrument) => {
    setSelected(inst);
    setLiveTick(null);
    setOhlc(null);
    setSearch('');
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

  const saveSettings = async () => {
    try {
      await api.updateAccount(accountId, {
        startingBalance: accountAmount,
        riskPercent,
        rewardRatio,
      });
      const f = await refresh();
      if (f) {
        setAccountAmount(f.total);
        setRiskPercent(f.riskPercent);
        setRewardRatio(f.rewardRatio);
      }
      setMessage('Settings saved');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save settings');
    }
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
      const entry = entryPrice;
      const levels = entry != null && entry > 0 ? calcLevels(side, entry) : null;
      const sl = levels ? levels.stopLoss : stopLoss ? Number(stopLoss) : undefined;
      const tg = levels ? levels.target : target ? Number(target) : undefined;
      if (levels) {
        setStopLoss(levels.stopLoss.toFixed(2));
        setTarget(levels.target.toFixed(2));
      }
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
        stopLoss: sl,
        target: tg,
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

  const squareOff = async (positionId: string, symbol: string) => {
    const ok = window.confirm(`Square off ${symbol}? This places a market order to close the position.`);
    if (!ok) return;
    setMessage('');
    try {
      const res = await api.squareOffPosition(positionId);
      setMessage(res.message || `Squared off ${symbol}`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Square-off failed');
    }
  };

  const squareOffAllMis = async () => {
    const mis = positions.filter((p) => p.productType === 'MIS');
    if (mis.length === 0) {
      setMessage('No MIS positions to square off');
      return;
    }
    const ok = window.confirm(`Square off all ${mis.length} MIS position(s)?`);
    if (!ok) return;
    setMessage('');
    try {
      const res = await api.squareOffMis();
      setMessage(res.message);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Square-off failed');
    }
  };

  return (
    <div className="page-content">
      {message && (
        <div className={`toast ${message.toLowerCase().includes('fail') ? 'toast-error' : 'toast-success'}`}>
          {message}
        </div>
      )}

      {page === 'settings' && (
        <section className="panel account-panel">
          <h2>Account & Risk Settings</h2>
          <p className="empty-inline">
            MIS (intraday) uses the price-band table below. CNC / NRML use Risk % and Reward Ratio from this form.
          </p>
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
            <label>
              Account Amount
              <input
                type="number"
                min={1}
                step="1000"
                value={accountAmount}
                onChange={(e) => setAccountAmount(Number(e.target.value))}
              />
            </label>
            <label>
              Risk % of entry (CNC / NRML)
              <input
                type="number"
                value={riskPercent}
                onChange={(e) => setRiskPercent(Number(e.target.value))}
                step="0.1"
                min={0.1}
              />
            </label>
            <label>
              Reward Ratio R (CNC / NRML)
              <input
                type="number"
                value={rewardRatio}
                onChange={(e) => setRewardRatio(Number(e.target.value))}
                step="0.1"
                min={0.1}
              />
            </label>
            <div className="actions">
              <button type="button" onClick={() => void saveSettings()}>Save Settings</button>
            </div>
          </div>

          <h3 style={{ marginTop: '1.5rem' }}>Intraday risk template (MIS)</h3>
          <table>
            <thead>
              <tr>
                <th>Share-price range</th>
                <th>Suggested price stop</th>
                <th>Target (1.5R)</th>
              </tr>
            </thead>
            <tbody>
              {INTRADAY_RISK_BANDS.map((band) => (
                <tr key={band.label}>
                  <td>{band.label}</td>
                  <td>{band.stopPercent.toFixed(2).replace(/\.?0+$/, '')}%</td>
                  <td>{band.targetPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
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
        <div className="terminal">
          <section className="term-chart">
            <div className="chart-toolbar">
              <div className="chart-title">
                <strong>{selected?.symbol ?? 'Select an instrument'}</strong>
                {selected && <span className="segment-tag">{selected.segment}</span>}
                {selected?.expiry && <span className="expiry-tag">Exp: {formatDate(selected.expiry)}</span>}
              </div>
              <div className="tf-group">
                {INTERVALS.map((iv) => (
                  <button
                    key={iv.id}
                    type="button"
                    className={chartInterval === iv.id ? 'tf-btn active' : 'tf-btn'}
                    onClick={() => setChartInterval(iv.id)}
                  >
                    {iv.label}
                  </button>
                ))}
              </div>
              {selected && (
                <div className="chart-quick">
                  <button type="button" className="quick-sell" onClick={() => void placeOrder('SELL')}>
                    <span>SELL</span>
                    <strong>{ltp != null ? ltp.toFixed(2) : '—'}</strong>
                  </button>
                  <button type="button" className="quick-buy" onClick={() => void placeOrder('BUY')}>
                    <span>BUY</span>
                    <strong>{ltp != null ? ltp.toFixed(2) : '—'}</strong>
                  </button>
                </div>
              )}
            </div>
            {selected && ohlc && (
              <div className="ohlc-row">
                <span>O <b>{ohlc.open.toFixed(2)}</b></span>
                <span>H <b>{ohlc.high.toFixed(2)}</b></span>
                <span>L <b>{ohlc.low.toFixed(2)}</b></span>
                <span>C <b>{ohlc.close.toFixed(2)}</b></span>
                {ltp != null && quotes[selected.id] != null && <span className="live-dot" title="Live" />}
              </div>
            )}
            {selected ? (
              <PriceChart
                instrumentId={selected.id}
                interval={chartInterval}
                live={liveTick}
                onOhlc={setOhlc}
              />
            ) : (
              <div className="chart-empty">Pick an instrument from the watchlist</div>
            )}
          </section>

          <aside className="term-side">
            <section className="watchlist">
              <div className="wl-head">
                <h3>Watchlist</h3>
                <input
                  placeholder="Search symbol…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {results.length > 0 && (
                  <ul className="search-results wl-results">
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
              </div>
              <div className="wl-scroll">
                <table className="wl-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th className="num">Last</th>
                      <th className="num">Chg%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchlist.map((w) => {
                      const last = quotes[w.id] ?? w.ltp;
                      const chg =
                        last != null && w.prevClose ? ((last - w.prevClose) / w.prevClose) * 100 : null;
                      return (
                        <tr
                          key={w.id}
                          className={selected?.id === w.id ? 'wl-row active' : 'wl-row'}
                          onClick={() => void selectInstrument(w)}
                        >
                          <td>
                            <strong>{w.symbol}</strong>
                            <span className="wl-seg">{w.segment}</span>
                          </td>
                          <td className="num">{last != null ? last.toFixed(2) : '—'}</td>
                          <td className={`num ${chg == null ? '' : chg < 0 ? 'loss' : 'profit'}`}>
                            {chg != null ? `${chg > 0 ? '+' : ''}${chg.toFixed(2)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ticket">
              {selected ? (
                <>
                  <div className="ticket-head">
                    <strong>{selected.symbol}</strong>
                    <span className="ticket-ltp">{ltp != null ? formatINR(ltp) : '—'}</span>
                  </div>
                  <p className="ticket-note">
                    {previewLevels && entryPrice != null ? (
                      <>
                        {previewLevels.source === 'intraday-table'
                          ? `Intraday band ${previewLevels.bandLabel}`
                          : 'Settings'}{' '}
                        · SL {formatINR(previewLevels.stopLoss)} · Target {formatINR(previewLevels.target)}
                      </>
                    ) : productType === 'MIS' ? (
                      'SL / Target from intraday price-band table'
                    ) : (
                      `SL / Target from Settings (risk ${riskPercent}%, reward ${rewardRatio}R)`
                    )}
                  </p>
                  <div className="ticket-grid">
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
                      <input value={stopLoss} readOnly title="Auto-calculated from risk rules" />
                    </label>
                    <label>
                      Target
                      <input value={target} readOnly title="Auto-calculated from risk rules" />
                    </label>
                  </div>
                  <div className="ticket-actions">
                    <button type="button" className="btn-sell" onClick={() => void placeOrder('SELL')}>Sell</button>
                    <button type="button" className="btn-buy" onClick={() => void placeOrder('BUY')}>Buy</button>
                  </div>
                </>
              ) : (
                <p className="ticket-note">Select an instrument to place an order.</p>
              )}
            </section>
          </aside>

          <section className="term-bottom">
            <div className="account-bar">
              <div className="acct-item"><span>Available</span><strong>{funds ? formatINR(funds.available) : '—'}</strong></div>
              <div className="acct-item"><span>Used margin</span><strong>{funds ? formatINR(funds.used) : '—'}</strong></div>
              <div className="acct-item"><span>Total</span><strong>{funds ? formatINR(funds.total) : '—'}</strong></div>
              <div className="acct-item">
                <span>Realized P/L</span>
                <strong className={funds && funds.realizedProfit - funds.realizedLoss < 0 ? 'loss' : 'profit'}>
                  {funds ? formatINR(funds.realizedProfit - funds.realizedLoss) : '—'}
                </strong>
              </div>
              <div className="acct-item">
                <span>Unrealized P/L</span>
                <strong className={funds && funds.unrealizedPL < 0 ? 'loss' : 'profit'}>
                  {funds ? formatINR(funds.unrealizedPL) : '—'}
                </strong>
              </div>
            </div>

            <div className="bottom-tabs">
              {(
                [
                  ['positions', `Positions${positions.length ? ` ${positions.length}` : ''}`],
                  ['holdings', `Holdings${holdings.length ? ` ${holdings.length}` : ''}`],
                  ['orders', 'Orders'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={bottomTab === id ? 'pill active' : 'pill'}
                  onClick={() => setBottomTab(id)}
                >
                  {label}
                </button>
              ))}
              {bottomTab === 'positions' && positions.some((p) => p.productType === 'MIS') && (
                <button type="button" className="btn-sell btn-sm pill-right" onClick={() => void squareOffAllMis()}>
                  Square Off All MIS
                </button>
              )}
            </div>

            <div className="bottom-scroll">
              {bottomTab === 'positions' && (
                <table>
                  <thead>
                    <tr>
                      <th>Symbol</th><th>Side</th><th>Product</th><th className="num">Qty</th>
                      <th className="num">Avg price</th><th className="num">Last</th>
                      <th className="num">Unrealized P/L</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.length === 0 ? (
                      <tr><td colSpan={8} className="empty">No open positions</td></tr>
                    ) : (
                      positions.map((p) => (
                        <tr key={p.id} className="clickable" onClick={() => void selectInstrument(p.instrument)}>
                          <td>{p.instrument.symbol}</td>
                          <td className={(p.side ?? 'BUY') === 'SELL' ? 'loss' : 'profit'}>{p.side ?? 'BUY'}</td>
                          <td>{p.productType}</td>
                          <td className="num">{p.quantity}</td>
                          <td className="num">{formatINR(p.averagePrice)}</td>
                          <td className="num">{quotes[p.instrumentId] != null ? formatINR(quotes[p.instrumentId]) : '—'}</td>
                          <td className={`num ${p.unrealizedPL < 0 ? 'loss' : 'profit'}`}>{formatINR(p.unrealizedPL)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-sm btn-sell"
                              onClick={(e) => {
                                e.stopPropagation();
                                void squareOff(p.id, p.instrument.symbol);
                              }}
                            >
                              Close
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {bottomTab === 'holdings' && (
                <table>
                  <thead>
                    <tr>
                      <th>Symbol</th><th className="num">Qty</th><th className="num">Avg price</th>
                      <th className="num">Last</th><th className="num">Value</th><th className="num">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.length === 0 ? (
                      <tr><td colSpan={6} className="empty">No holdings — CNC positions settle T+1</td></tr>
                    ) : (
                      holdings.map((h) => {
                        const ltpNow = quotes[h.instrument.id];
                        const pl = ltpNow != null ? (ltpNow - h.averagePrice) * h.quantity : null;
                        return (
                          <tr key={h.id} className="clickable" onClick={() => void selectInstrument(h.instrument)}>
                            <td>{h.instrument.symbol}</td>
                            <td className="num">{h.quantity}</td>
                            <td className="num">{formatINR(h.averagePrice)}</td>
                            <td className="num">{ltpNow != null ? formatINR(ltpNow) : '—'}</td>
                            <td className="num">{ltpNow != null ? formatINR(ltpNow * h.quantity) : '—'}</td>
                            <td className={`num ${pl == null ? '' : pl < 0 ? 'loss' : 'profit'}`}>
                              {pl != null ? formatINR(pl) : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {bottomTab === 'orders' && (
                <table>
                  <thead>
                    <tr>
                      <th>Time</th><th>Symbol</th><th>Side</th><th>Type</th><th>Product</th><th>Mode</th>
                      <th className="num">Qty</th><th className="num">Price</th><th>Status</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr><td colSpan={10} className="empty">No orders</td></tr>
                    ) : (
                      orders.map((o) => (
                        <tr key={o.id}>
                          <td>{new Date(o.createdAt).toLocaleString('en-IN')}</td>
                          <td>{o.instrument.symbol}</td>
                          <td className={o.side === 'SELL' ? 'loss' : 'profit'}>{o.side}</td>
                          <td>{o.orderType}</td>
                          <td>{o.productType}</td>
                          <td><span className={`status status-${(o.mode ?? 'PAPER').toLowerCase()}`}>{o.mode ?? 'PAPER'}</span></td>
                          <td className="num">{o.quantity}</td>
                          <td className="num">
                            {o.averagePrice != null ? formatINR(o.averagePrice) : o.price != null ? formatINR(o.price) : '—'}
                          </td>
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
              )}

            </div>
          </section>
        </div>
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
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
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
    if (!selectedId || instruments.length === 0) {
      setMessage('Add at least one instrument first');
      return;
    }
    setLoading(true);
    setMessage('');
    setBacktest(null);
    try {
      const result = await api.backtestAlgo(selectedId, {
        instrumentIds: instruments.map((i) => i.id),
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
      setMessage(
        `Backtest done — ${instruments.length} instrument${instruments.length === 1 ? '' : 's'}, ${result.candleCount} candles, P/L ${formatINR(result.totalPnL)}`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  const deploy = async () => {
    if (!selectedId || instruments.length === 0) {
      setMessage('Add at least one instrument first');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const dep = await api.deployAlgo(selectedId, {
        paperAccountId: accountId,
        instrumentIds: instruments.map((i) => i.id),
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
      setMessage(`Deployed on ${instruments.length} instrument${instruments.length === 1 ? '' : 's'} — deployment ${dep.id.slice(0, 8)}…`);
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

  const addInstrument = (inst: Instrument) => {
    setInstruments((prev) => (prev.some((i) => i.id === inst.id) ? prev : [...prev, inst]));
    setSearch('');
    setResults([]);
  };

  const removeInstrument = (id: string) => {
    setInstruments((prev) => prev.filter((i) => i.id !== id));
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
                    Instruments
                    <input
                      placeholder="Search and add (e.g. RELIANCE, TCS)"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  {results.length > 0 && (
                    <ul className="search-results">
                      {results.map((inst) => (
                        <li key={inst.id}>
                          <button type="button" onClick={() => addInstrument(inst)}>
                            <strong>{inst.symbol}</strong>
                            <span className="inst-name">{inst.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="chip-list">
                    {instruments.length === 0 ? (
                      <span className="chip-hint">No instruments added yet</span>
                    ) : (
                      instruments.map((inst) => (
                        <span key={inst.id} className="chip">
                          {inst.symbol}
                          <button
                            type="button"
                            aria-label={`Remove ${inst.symbol}`}
                            onClick={() => removeInstrument(inst.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
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
                  {backtest.perInstrument && (
                    <table>
                      <thead>
                        <tr>
                          <th>Instrument</th>
                          <th>Trades</th>
                          <th>Win Rate</th>
                          <th>P/L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtest.perInstrument.map((p) => (
                          <tr key={p.instrumentId}>
                            <td>{p.symbol}</td>
                            <td>{p.totalTrades}</td>
                            <td>{p.winRate.toFixed(1)}%</td>
                            <td className={p.totalPnL < 0 ? 'loss' : 'profit'}>{formatINR(p.totalPnL)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        {backtest.perInstrument && <th>Symbol</th>}
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
                          {backtest.perInstrument && <td>{t.symbol}</td>}
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

const DEV_EMAIL = 'demo@paper.local';
const DEV_PASSWORD = 'demo1234';
const DEV_NAME = 'Demo Trader';

async function ensureDevSession(): Promise<AuthResponse> {
  const token = getToken();
  if (token) {
    try {
      const me = await api.me();
      return {
        token,
        user: { id: me.id, email: me.email, name: me.name },
        account: me.accounts[0],
      };
    } catch {
      clearToken();
    }
  }

  try {
    const res = await api.login(DEV_EMAIL, DEV_PASSWORD);
    setToken(res.token);
    return res;
  } catch {
    const res = await api.register(DEV_EMAIL, DEV_PASSWORD, DEV_NAME);
    setToken(res.token);
    return res;
  }
}

function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureDevSession()
      .then(setAuth)
      .catch(() => {
        /* fall through to AuthScreen if API is down */
      })
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
    <ThemeToggle />
  </StrictMode>,
);
