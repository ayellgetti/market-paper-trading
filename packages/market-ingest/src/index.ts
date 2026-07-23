import 'dotenv/config';
import { Redis } from 'ioredis';
import { prisma } from '@paper-trading/db';
import { MockBrokerAdapter, seedInstruments } from '@paper-trading/broker-adapters';
import { OrderService, updatePositionMTM } from '@paper-trading/oms';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const TICK_CHANNEL = 'quotes';

const redis = new Redis(REDIS_URL);
const orderService = new OrderService(prisma);
const broker = new MockBrokerAdapter();

const tokenToInstrumentId = new Map<string, string>();

async function main(): Promise<void> {
  await seedInstruments();

  const instruments = await prisma.instrument.findMany({
    where: { isActive: true },
  });

  for (const inst of instruments) {
    if (inst.brokerToken) {
      tokenToInstrumentId.set(inst.brokerToken, inst.id);
    }
  }

  await broker.connect({ apiKey: 'mock', accessToken: 'mock' });

  broker.onTick(async (tick) => {
    const instrumentId = tokenToInstrumentId.get(tick.instrumentToken);
    if (!instrumentId) return;

    const instrument = instruments.find((i) => i.id === instrumentId);
    if (!instrument) return;

    await prisma.marketTick.create({
      data: {
        instrumentId,
        ltp: tick.ltp,
        open: tick.open,
        high: tick.high,
        low: tick.low,
        close: tick.close,
        volume: BigInt(tick.volume),
        timestamp: tick.timestamp,
      },
    });

    await orderService.processOpenOrders(instrumentId, tick.ltp);
    await updatePositionMTM(prisma, instrumentId, tick.ltp);

    const payload = JSON.stringify({
      instrumentId,
      symbol: instrument.symbol,
      ltp: tick.ltp,
      volume: tick.volume,
      timestamp: tick.timestamp.toISOString(),
    });

    await redis.publish(TICK_CHANNEL, payload);
  });

  const tokens = instruments
    .map((i) => i.brokerToken)
    .filter((t): t is string => Boolean(t));

  broker.subscribe(tokens);
  console.log(`Market ingest running — streaming ${tokens.length} instruments`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
