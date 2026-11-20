import type { PrismaClient } from '@paper-trading/db';
import type { SMAParams } from '@paper-trading/strategy-sdk';
import { OrderService } from '@paper-trading/oms';
import { Redis } from 'ioredis';
import { SMALiveRunner } from './sma-live-runner.js';

type RunnerEntry = {
  deploymentId: string;
  instrumentIds: Set<string>;
  runner: SMALiveRunner;
};

export class DeploymentManager {
  private runners = new Map<string, RunnerEntry>();
  private orderService: OrderService;

  constructor(
    private db: PrismaClient,
    private redis: Redis,
  ) {
    this.orderService = new OrderService(db);
  }

  async syncDeployments(): Promise<void> {
    const active = await this.db.algoDeployment.findMany({
      where: { status: 'DEPLOYED' },
      include: { algo: true, paperAccount: { select: { userId: true } } },
    });

    const activeIds = new Set(active.map((d) => d.id));

    for (const id of this.runners.keys()) {
      if (!activeIds.has(id)) {
        this.runners.delete(id);
      }
    }

    for (const dep of active) {
      if (this.runners.has(dep.id)) continue;

      const config = dep.config as unknown as SMAParams & { instrumentId?: string };
      if (config.strategyType !== 'sma_crossover') continue;

      // `symbols` holds the instrument ids; older deployments only have config.instrumentId.
      const instrumentIds = new Set(
        dep.symbols.length > 0 ? dep.symbols : config.instrumentId ? [config.instrumentId] : [],
      );
      if (instrumentIds.size === 0) continue;

      const runner = new SMALiveRunner(
        config,
        dep.id,
        dep.paperAccount.userId,
        dep.paperAccountId,
        this.db,
        this.orderService,
        this.redis,
        dep.maxLoss ? Number(dep.maxLoss) : null,
        dep.maxOrdersPerDay,
        {
          onLog: async (level, message) => {
            await this.db.algoLog.create({
              data: { algoDeploymentId: dep.id, level, message },
            });
            await this.redis.publish(
              'algo-events',
              JSON.stringify({ deploymentId: dep.id, event: 'log', data: { level, message } }),
            );
          },
          onSignal: async (signalType, price, reason) => {
            await this.db.algoSignal.create({
              data: {
                algoDeploymentId: dep.id,
                signalType,
                price,
                reason,
              },
            });
            await this.redis.publish(
              'algo-events',
              JSON.stringify({
                deploymentId: dep.id,
                event: 'signal',
                data: { signalType, price, reason },
              }),
            );
          },
          onStopped: async (reason) => {
            await this.db.algoDeployment.update({
              where: { id: dep.id },
              data: { status: 'STOPPED', stoppedAt: new Date() },
            });
            await this.db.algoLog.create({
              data: { algoDeploymentId: dep.id, level: 'WARN', message: `Stopped: ${reason}` },
            });
            this.runners.delete(dep.id);
          },
        },
      );

      this.runners.set(dep.id, {
        deploymentId: dep.id,
        instrumentIds,
        runner,
      });

      await this.db.algoLog.create({
        data: {
          algoDeploymentId: dep.id,
          level: 'INFO',
          message: `Deployment started for ${config.strategyType} on ${instrumentIds.size} instrument${instrumentIds.size === 1 ? '' : 's'}`,
        },
      });
    }
  }

  async onTick(instrumentId: string, ltp: number, symbol: string): Promise<void> {
    for (const entry of this.runners.values()) {
      if (entry.instrumentIds.has(instrumentId)) {
        await entry.runner.onTick(instrumentId, ltp, symbol);
      }
    }
  }

  async stopAllForUser(userId: string): Promise<number> {
    const deps = await this.db.algoDeployment.findMany({
      where: { status: 'DEPLOYED', paperAccount: { userId } },
    });

    for (const dep of deps) {
      await this.db.algoDeployment.update({
        where: { id: dep.id },
        data: { status: 'STOPPED', stoppedAt: new Date() },
      });
      this.runners.delete(dep.id);
    }

    return deps.length;
  }

  get activeCount(): number {
    return this.runners.size;
  }
}
