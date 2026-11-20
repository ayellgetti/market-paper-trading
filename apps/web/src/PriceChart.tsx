import { useEffect, useRef, useState } from 'react';
import {
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { api, type Candle, type CandleInterval } from './api/client';

const STEP_SECONDS: Record<CandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1d': 86400,
};

export const INTERVALS: Array<{ id: CandleInterval; label: string }> = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '1d', label: '1D' },
];

interface Ohlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function themeOptions() {
  const text = cssVar('--text-muted');
  const grid = cssVar('--border');
  return {
    layout: { background: { color: cssVar('--surface') }, textColor: text },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: grid },
    timeScale: { borderColor: grid },
    crosshair: { mode: CrosshairMode.Normal },
  };
}

export function PriceChart({
  instrumentId,
  interval,
  live,
  onOhlc,
}: {
  instrumentId: string;
  interval: CandleInterval;
  live: { ltp: number; ts: number } | null;
  onOhlc?: (ohlc: Ohlc | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastRef = useRef<Candle | null>(null);
  const onOhlcRef = useRef(onOhlc);
  onOhlcRef.current = onOhlc;
  const [simulatedNote, setSimulatedNote] = useState(false);
  const [empty, setEmpty] = useState(false);

  // Create the chart once and keep it in sync with size and theme.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      ...themeOptions(),
      autoSize: true,
      timeScale: { ...themeOptions().timeScale, timeVisible: true, secondsVisible: false },
    });
    const series = chart.addCandlestickSeries({
      upColor: cssVar('--green'),
      downColor: cssVar('--red'),
      wickUpColor: cssVar('--green'),
      wickDownColor: cssVar('--red'),
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      const d = param.seriesData.get(series) as Ohlc | undefined;
      if (d) onOhlcRef.current?.({ open: d.open, high: d.high, low: d.low, close: d.close });
      else if (lastRef.current) onOhlcRef.current?.(lastRef.current);
    });

    const applyTheme = () => {
      chart.applyOptions(themeOptions());
      series.applyOptions({
        upColor: cssVar('--green'),
        downColor: cssVar('--red'),
        wickUpColor: cssVar('--green'),
        wickDownColor: cssVar('--red'),
      });
    };
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load history whenever the instrument or timeframe changes.
  useEffect(() => {
    let cancelled = false;
    lastRef.current = null;
    seriesRef.current?.setData([]);
    setEmpty(false);
    void api
      .getCandles(instrumentId, interval)
      .then(({ candles }) => {
        if (cancelled || !seriesRef.current) return;
        seriesRef.current.setData(
          candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        const last = candles[candles.length - 1] ?? null;
        lastRef.current = last;
        setEmpty(candles.length === 0);
        setSimulatedNote(candles.some((c) => c.simulated));
        onOhlcRef.current?.(last);
        chartRef.current?.timeScale().fitContent();
      })
      .catch(() => {
        if (!cancelled) setEmpty(true);
      });
    return () => {
      cancelled = true;
    };
  }, [instrumentId, interval]);

  // Fold live ticks into the latest candle.
  useEffect(() => {
    const series = seriesRef.current;
    const last = lastRef.current;
    if (!live || !series || !last) return;
    const step = STEP_SECONDS[interval];
    const bucket = Math.floor(live.ts / 1000 / step) * step;
    let next: Candle;
    if (bucket > last.time) {
      next = { time: bucket, open: last.close, high: live.ltp, low: live.ltp, close: live.ltp };
    } else {
      next = {
        ...last,
        high: Math.max(last.high, live.ltp),
        low: Math.min(last.low, live.ltp),
        close: live.ltp,
      };
    }
    lastRef.current = next;
    series.update({
      time: next.time as UTCTimestamp,
      open: next.open,
      high: next.high,
      low: next.low,
      close: next.close,
    });
    onOhlcRef.current?.(next);
  }, [live, interval]);

  return (
    <div className="chart-wrap">
      <div ref={containerRef} className="chart-canvas" />
      {empty && <div className="chart-empty">No price data yet for this instrument</div>}
      {simulatedNote && (
        <div className="chart-note" title="Real ticks are only collected while the app runs">
          Earlier history is simulated
        </div>
      )}
    </div>
  );
}
