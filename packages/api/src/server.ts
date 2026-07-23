import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { authRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/accounts.js';
import { instrumentRoutes } from './routes/instruments.js';
import { orderRoutes } from './routes/orders.js';
import { positionRoutes } from './routes/positions.js';
import { tradeRoutes } from './routes/trades.js';
import { journalRoutes } from './routes/journal.js';
import { holdingRoutes } from './routes/holdings.js';
import { adminRoutes } from './routes/admin.js';
import { algoRoutes } from './routes/algos.js';
import { brokerRoutes } from './routes/broker.js';
import { seedInstruments } from '@paper-trading/broker-adapters';

const PORT = Number(process.env.API_PORT ?? 3000);
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: JWT_SECRET });

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(accountRoutes, { prefix: '/api/v1/accounts' });
  await app.register(instrumentRoutes, { prefix: '/api/v1/instruments' });
  await app.register(orderRoutes, { prefix: '/api/v1/orders' });
  await app.register(positionRoutes, { prefix: '/api/v1/positions' });
  await app.register(tradeRoutes, { prefix: '/api/v1/trades' });
  await app.register(journalRoutes, { prefix: '/api/v1/journal' });
  await app.register(holdingRoutes, { prefix: '/api/v1/holdings' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(algoRoutes, { prefix: '/api/v1/algos' });
  await app.register(brokerRoutes, { prefix: '/api/v1/broker' });

  await seedInstruments();

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`API server listening on port ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
