import { prisma } from '@paper-trading/db';
import { NSE_EQUITY_INSTRUMENTS } from './instruments.js';
import {
  ALL_DERIVATIVE_INSTRUMENTS,
  derivativeBrokerToken,
  derivativeDisplaySymbol,
} from './derivatives.js';

async function upsertEquity(stock: (typeof NSE_EQUITY_INSTRUMENTS)[number]): Promise<void> {
  const existing = await prisma.instrument.findFirst({
    where: {
      symbol: stock.symbol,
      exchange: 'NSE',
      instrumentType: 'EQ',
      expiry: null,
      strike: null,
    },
  });

  if (existing) {
    await prisma.instrument.update({
      where: { id: existing.id },
      data: { name: stock.name, isActive: true, brokerToken: stock.symbol },
    });
  } else {
    await prisma.instrument.create({
      data: {
        symbol: stock.symbol,
        name: stock.name,
        segment: 'EQUITY',
        exchange: 'NSE',
        instrumentType: 'EQ',
        lotSize: 1,
        tickSize: 0.05,
        brokerToken: stock.symbol,
        isActive: true,
      },
    });
  }
}

async function upsertDerivative(
  d: (typeof ALL_DERIVATIVE_INSTRUMENTS)[number],
): Promise<void> {
  const token = derivativeBrokerToken(d);
  const displayName = `${derivativeDisplaySymbol(d)} — ${d.name}`;

  const existing = await prisma.instrument.findFirst({
    where: {
      symbol: d.symbol,
      exchange: d.exchange,
      instrumentType: d.instrumentType,
      expiry: d.expiry,
      strike: d.strike ?? null,
    },
  });

  const data = {
    symbol: d.symbol,
    name: displayName,
    segment: d.segment,
    exchange: d.exchange,
    instrumentType: d.instrumentType,
    expiry: d.expiry,
    strike: d.strike ?? null,
    lotSize: d.lotSize,
    tickSize: d.tickSize,
    brokerToken: token,
    isActive: true,
  };

  if (existing) {
    await prisma.instrument.update({ where: { id: existing.id }, data });
  } else {
    await prisma.instrument.create({ data });
  }
}

export async function seedInstruments(): Promise<void> {
  for (const stock of NSE_EQUITY_INSTRUMENTS) {
    await upsertEquity(stock);
  }
  for (const d of ALL_DERIVATIVE_INSTRUMENTS) {
    await upsertDerivative(d);
  }
}

export async function getBasePrice(symbol: string, brokerToken?: string | null): Promise<number> {
  const equity = NSE_EQUITY_INSTRUMENTS.find((s) => s.symbol === symbol);
  if (equity) return equity.basePrice;

  const derivative = ALL_DERIVATIVE_INSTRUMENTS.find(
    (d) => derivativeBrokerToken(d) === brokerToken || d.symbol === symbol,
  );
  if (derivative) return derivative.basePrice;

  return 1000;
}

export { ALL_DERIVATIVE_INSTRUMENTS, derivativeBrokerToken, derivativeDisplaySymbol };
