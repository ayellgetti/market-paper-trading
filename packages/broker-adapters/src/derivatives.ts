import type { Exchange, InstrumentType, Segment } from '@paper-trading/db';

export type DerivativeSeed = {
  symbol: string;
  name: string;
  segment: Segment;
  exchange: Exchange;
  instrumentType: InstrumentType;
  expiry: Date;
  strike?: number;
  lotSize: number;
  tickSize: number;
  basePrice: number;
};

function lastThursdayOfMonth(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month + 1, 0));
  while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function nextMonthlyExpiry(): Date {
  const now = new Date();
  let expiry = lastThursdayOfMonth(now.getFullYear(), now.getMonth());
  if (expiry <= now) {
    expiry = lastThursdayOfMonth(now.getFullYear(), now.getMonth() + 1);
  }
  expiry.setUTCHours(10, 0, 0, 0);
  return expiry;
}

const expiry = nextMonthlyExpiry();

export const FNO_INSTRUMENTS: DerivativeSeed[] = [
  {
    symbol: 'NIFTY',
    name: 'NIFTY 50 Index Futures',
    segment: 'FNO',
    exchange: 'NFO',
    instrumentType: 'FUT',
    expiry,
    lotSize: 75,
    tickSize: 0.05,
    basePrice: 24500,
  },
  {
    symbol: 'BANKNIFTY',
    name: 'NIFTY Bank Index Futures',
    segment: 'FNO',
    exchange: 'NFO',
    instrumentType: 'FUT',
    expiry,
    lotSize: 30,
    tickSize: 0.05,
    basePrice: 52000,
  },
  {
    symbol: 'NIFTY',
    name: 'NIFTY 24500 CE',
    segment: 'FNO',
    exchange: 'NFO',
    instrumentType: 'CE',
    expiry,
    strike: 24500,
    lotSize: 75,
    tickSize: 0.05,
    basePrice: 350,
  },
  {
    symbol: 'NIFTY',
    name: 'NIFTY 24500 PE',
    segment: 'FNO',
    exchange: 'NFO',
    instrumentType: 'PE',
    expiry,
    strike: 24500,
    lotSize: 75,
    tickSize: 0.05,
    basePrice: 280,
  },
];

export const COMMODITY_INSTRUMENTS: DerivativeSeed[] = [
  {
    symbol: 'GOLD',
    name: 'Gold Futures',
    segment: 'COMMODITY',
    exchange: 'MCX',
    instrumentType: 'FUT',
    expiry,
    lotSize: 100,
    tickSize: 1,
    basePrice: 72000,
  },
  {
    symbol: 'SILVER',
    name: 'Silver Futures',
    segment: 'COMMODITY',
    exchange: 'MCX',
    instrumentType: 'FUT',
    expiry,
    lotSize: 30,
    tickSize: 1,
    basePrice: 92000,
  },
];

export const CURRENCY_INSTRUMENTS: DerivativeSeed[] = [
  {
    symbol: 'USDINR',
    name: 'USD/INR Futures',
    segment: 'CURRENCY',
    exchange: 'CDS',
    instrumentType: 'FUT',
    expiry,
    lotSize: 1000,
    tickSize: 0.0025,
    basePrice: 83.5,
  },
];

export function derivativeBrokerToken(d: DerivativeSeed): string {
  if (d.instrumentType === 'FUT') {
    return `${d.symbol}-FUT-${d.expiry.toISOString().slice(0, 10)}`;
  }
  return `${d.symbol}-${d.strike}-${d.instrumentType}-${d.expiry.toISOString().slice(0, 10)}`;
}

export function derivativeDisplaySymbol(d: DerivativeSeed): string {
  if (d.instrumentType === 'FUT') {
    return `${d.symbol} FUT`;
  }
  return `${d.symbol} ${d.strike} ${d.instrumentType}`;
}

export const ALL_DERIVATIVE_INSTRUMENTS = [
  ...FNO_INSTRUMENTS,
  ...COMMODITY_INSTRUMENTS,
  ...CURRENCY_INSTRUMENTS,
];
