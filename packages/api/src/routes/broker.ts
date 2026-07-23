import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@paper-trading/db';
import { BrokerService } from '../services/broker-service.js';
import { AuditService } from '../services/audit-service.js';

const brokerService = new BrokerService(prisma);
const auditService = new AuditService(prisma);

const connectSchema = z.object({
  brokerType: z.enum(['ZERODHA', 'ANGEL_ONE', 'UPSTOX', 'FYERS', 'DHANI']),
  simulate: z.boolean().optional(),
});

export async function brokerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/zerodha/login-url', { preHandler: [app.authenticate] }, async (_request, reply) => {
    try {
      if (!process.env.ZERODHA_API_KEY) {
        if (brokerService.isSimulationEnabled()) {
          return {
            simulation: true,
            message: 'Use POST /broker/connect with simulate:true (Zerodha keys not configured)',
          };
        }
        return reply.status(400).send({ error: 'ZERODHA_API_KEY not configured' });
      }
      return { loginUrl: brokerService.getZerodhaLoginUrl(), simulation: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to build login URL';
      return reply.status(400).send({ error: message });
    }
  });

  app.post('/zerodha/callback', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const body = z.object({ requestToken: z.string().min(1) }).parse(request.body);

    try {
      const result = await brokerService.exchangeZerodhaAndStore(userId, body.requestToken);
      await auditService.log(userId, 'BROKER_CONNECTED', 'broker_connection', result.id, {
        brokerType: 'ZERODHA',
      }, request);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OAuth callback failed';
      return reply.status(400).send({ error: message });
    }
  });

  app.post('/connect', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const body = connectSchema.parse(request.body);

    if (body.simulate) {
      const result = await brokerService.connectSimulated(userId, body.brokerType);
      await auditService.log(userId, 'BROKER_CONNECTED_SIM', 'broker_connection', result.id, {
        brokerType: body.brokerType,
        simulated: true,
      }, request);
      return { ...result, simulated: true, message: 'Simulated broker connection (no real orders unless LIVE_TRADING_SIMULATION=false)' };
    }

    return reply.status(400).send({
      error: 'Use OAuth flow: GET /broker/zerodha/login-url then POST /broker/zerodha/callback',
    });
  });

  app.get('/connections', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;
    return brokerService.listConnections(userId);
  });

  app.delete('/connections/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    const { id } = request.params as { id: string };

    try {
      await brokerService.disconnect(userId, id);
      await auditService.log(userId, 'BROKER_DISCONNECTED', 'broker_connection', id, {}, request);
      return { disconnected: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Disconnect failed';
      return reply.status(400).send({ error: message });
    }
  });

  app.get('/live/portfolio', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    try {
      return await brokerService.syncLivePortfolio(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      return reply.status(400).send({ error: message });
    }
  });

  app.get('/live/orders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user;
    try {
      const adapter = await brokerService.getLiveAdapter(userId);
      const orders = (await adapter.getOrderBook?.()) ?? [];
      return orders;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch broker orders';
      return reply.status(400).send({ error: message });
    }
  });

  app.get('/audit', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = request.user;
    const { limit } = request.query as { limit?: string };

    return prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit ?? 50), 200),
    });
  });
}
