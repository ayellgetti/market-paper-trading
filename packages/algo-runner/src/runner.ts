import 'dotenv/config';
import { Redis } from 'ioredis';
import { prisma } from '@paper-trading/db';
import { DeploymentManager } from './deployment-manager.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const TICK_CHANNEL = 'quotes';

const redisSub = new Redis(REDIS_URL);
const redis = new Redis(REDIS_URL);
const manager = new DeploymentManager(prisma, redis);

const tokenToInstrument = new Map<string, { id: string; symbol: string }>();

async function loadInstruments(): Promise<void> {
  const instruments = await prisma.instrument.findMany({ where: { isActive: true } });
  tokenToInstrument.clear();
  for (const inst of instruments) {
    if (inst.brokerToken) {
      tokenToInstrument.set(inst.brokerToken, { id: inst.id, symbol: inst.symbol });
    }
  }
}

async function main(): Promise<void> {
  await loadInstruments();
  await manager.syncDeployments();

  setInterval(() => void manager.syncDeployments(), 10_000);
  setInterval(() => void loadInstruments(), 60_000);

  redisSub.subscribe(TICK_CHANNEL);
  redisSub.on('message', (_ch: string, message: string) => {
    void (async () => {
      try {
        const tick = JSON.parse(message) as {
          instrumentId: string;
          symbol: string;
          ltp: number;
        };
        await manager.onTick(tick.instrumentId, tick.ltp, tick.symbol);
      } catch {
        // ignore
      }
    })();
  });

  console.log(`Algo runner active — ${manager.activeCount} deployments`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
