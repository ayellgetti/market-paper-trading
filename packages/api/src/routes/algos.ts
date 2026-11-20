import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@paper-trading/db';
import { DEFAULT_SMA_SOURCE } from '@paper-trading/strategy-sdk';
import { runBacktestForAlgo } from '@paper-trading/algo-runner';
import type { SMAParams } from '@paper-trading/strategy-sdk';

const createAlgoSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sourceCode: z.string().optional(),
});

const updateAlgoSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  sourceCode: z.string().optional(),
  status: z.enum(['DRAFT', 'BACKTESTING', 'DEPLOYED', 'PAUSED', 'STOPPED']).optional(),
});

const MAX_INSTRUMENTS = 20;

// A strategy can trade several instruments. `instrumentId` is the legacy single-instrument form.
const instrumentFields = {
  instrumentIds: z.array(z.string()).min(1).max(MAX_INSTRUMENTS).optional(),
  instrumentId: z.string().optional(),
};

function resolveInstrumentIds(body: { instrumentIds?: string[]; instrumentId?: string }): string[] {
  const ids = body.instrumentIds ?? (body.instrumentId ? [body.instrumentId] : []);
  return [...new Set(ids)];
}

const deploySchema = z.object({
  paperAccountId: z.string(),
  ...instrumentFields,
  config: z.object({
    strategyType: z.literal('sma_crossover'),
    fastPeriod: z.number().int().min(2).default(9),
    slowPeriod: z.number().int().min(3).default(21),
    quantity: z.number().int().positive(),
    productType: z.enum(['CNC', 'MIS', 'NRML']).default('MIS'),
  }),
  maxLoss: z.number().positive().optional(),
  maxOrdersPerDay: z.number().int().positive().default(100),
});

const backtestSchema = z.object({
  ...instrumentFields,
  days: z.number().int().min(1).max(90).default(30),
  interval: z.string().default('5m'),
  config: z.object({
    strategyType: z.literal('sma_crossover'),
    fastPeriod: z.number().int().min(2).default(9),
    slowPeriod: z.number().int().min(3).default(21),
    quantity: z.number().int().positive(),
    productType: z.enum(['CNC', 'MIS', 'NRML']).default('MIS'),
  }),
});

async function validateInstruments(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return 'Select at least one instrument';
  if (ids.length > MAX_INSTRUMENTS) return `At most ${MAX_INSTRUMENTS} instruments per strategy`;
  const found = await prisma.instrument.count({ where: { id: { in: ids }, isActive: true } });
  return found === ids.length ? null : 'One or more instruments were not found';
}

export async function algoRoutes(app: FastifyInstance): Promise<void> {
  app.post('/kill-switch', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;

    const deps = await prisma.algoDeployment.findMany({
      where: { status: 'DEPLOYED', paperAccount: { userId } },
    });

    await prisma.algoDeployment.updateMany({
      where: { id: { in: deps.map((d) => d.id) } },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });

    await prisma.algo.updateMany({
      where: { userId, status: 'DEPLOYED' },
      data: { status: 'STOPPED' },
    });

    return { stopped: deps.length, message: `Kill switch — ${deps.length} algos stopped` };
  });

  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;
    return prisma.algo.findMany({
      where: { userId },
      include: {
        deployments: {
          orderBy: { startedAt: 'desc' },
          take: 3,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  });

  app.post('/', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;
    const body = createAlgoSchema.parse(request.body);

    return prisma.algo.create({
      data: {
        userId,
        name: body.name,
        description: body.description,
        sourceCode: body.sourceCode ?? DEFAULT_SMA_SOURCE,
        status: 'DRAFT',
      },
    });
  });

  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };

    const algo = await prisma.algo.findFirst({
      where: { id, userId },
      include: { deployments: { orderBy: { startedAt: 'desc' } } },
    });
    if (!algo) return reply.status(404).send({ error: 'Algo not found' });
    return algo;
  });

  app.put('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };
    const body = updateAlgoSchema.parse(request.body);

    const algo = await prisma.algo.findFirst({ where: { id, userId } });
    if (!algo) return reply.status(404).send({ error: 'Algo not found' });

    return prisma.algo.update({ where: { id }, data: body });
  });

  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };

    const algo = await prisma.algo.findFirst({ where: { id, userId } });
    if (!algo) return reply.status(404).send({ error: 'Algo not found' });

    await prisma.algoDeployment.updateMany({
      where: { algoId: id, status: 'DEPLOYED' },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });

    await prisma.algo.delete({ where: { id } });
    return { deleted: true };
  });

  app.post('/:id/backtest', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };
    const body = backtestSchema.parse(request.body);

    const algo = await prisma.algo.findFirst({ where: { id, userId } });
    if (!algo) return reply.status(404).send({ error: 'Algo not found' });

    const instrumentIds = resolveInstrumentIds(body);
    const invalid = await validateInstruments(instrumentIds);
    if (invalid) return reply.status(400).send({ error: invalid });

    await prisma.algo.update({ where: { id }, data: { status: 'BACKTESTING' } });

    const config: SMAParams = {
      strategyType: 'sma_crossover',
      fastPeriod: body.config.fastPeriod,
      slowPeriod: body.config.slowPeriod,
      quantity: body.config.quantity,
      productType: body.config.productType,
    };

    try {
      const result = await runBacktestForAlgo(prisma, config, instrumentIds, body.days, body.interval);
      await prisma.algo.update({ where: { id }, data: { status: 'DRAFT' } });
      return result;
    } catch (err) {
      await prisma.algo.update({ where: { id }, data: { status: 'DRAFT' } });
      const message = err instanceof Error ? err.message : 'Backtest failed';
      return reply.status(400).send({ error: message });
    }
  });

  app.post('/:id/deploy', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };
    const body = deploySchema.parse(request.body);

    const algo = await prisma.algo.findFirst({ where: { id, userId } });
    if (!algo) return reply.status(404).send({ error: 'Algo not found' });

    const account = await prisma.paperAccount.findFirst({
      where: { id: body.paperAccountId, userId },
    });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    const instrumentIds = resolveInstrumentIds(body);
    const invalid = await validateInstruments(instrumentIds);
    if (invalid) return reply.status(400).send({ error: invalid });

    const config: SMAParams = {
      strategyType: 'sma_crossover',
      fastPeriod: body.config.fastPeriod,
      slowPeriod: body.config.slowPeriod,
      quantity: body.config.quantity,
      productType: body.config.productType,
    };

    const deployment = await prisma.algoDeployment.create({
      data: {
        algoId: id,
        paperAccountId: body.paperAccountId,
        mode: 'PAPER',
        symbols: instrumentIds,
        config: config as object,
        status: 'DEPLOYED',
        maxLoss: body.maxLoss,
        maxOrdersPerDay: body.maxOrdersPerDay,
      },
    });

    await prisma.algo.update({ where: { id }, data: { status: 'DEPLOYED' } });

    return deployment;
  });

  app.post('/:id/stop', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };

    const algo = await prisma.algo.findFirst({ where: { id, userId } });
    if (!algo) return reply.status(404).send({ error: 'Algo not found' });

    await prisma.algoDeployment.updateMany({
      where: { algoId: id, status: 'DEPLOYED' },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });

    await prisma.algo.update({ where: { id }, data: { status: 'STOPPED' } });
    return { stopped: true };
  });

  app.get('/:id/logs', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };
    const { deploymentId } = request.query as { deploymentId?: string };

    const algo = await prisma.algo.findFirst({ where: { id, userId } });
    if (!algo) return reply.status(404).send({ error: 'Algo not found' });

    return prisma.algoLog.findMany({
      where: {
        deployment: {
          algoId: id,
          ...(deploymentId ? { id: deploymentId } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  app.get('/:id/signals', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };

    const algo = await prisma.algo.findFirst({ where: { id, userId } });
    if (!algo) return reply.status(404).send({ error: 'Algo not found' });

    return prisma.algoSignal.findMany({
      where: { deployment: { algoId: id } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });
}
