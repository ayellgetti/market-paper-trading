import 'dotenv/config';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { Redis } from 'ioredis';

const PORT = Number(process.env.WS_PORT ?? 3001);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';
const TICK_CHANNEL = 'quotes';
const ALGO_CHANNEL = 'algo-events';

const redisSub = new Redis(REDIS_URL);

type WsClient = {
  send: (payload: object) => void;
  algoDeployments: Set<string>;
};

async function main(): Promise<void> {
  const app = Fastify({ logger: true });
  await app.register(websocket);

  const quoteClients = new Set<WsClient>();
  const algoClients = new Set<WsClient>();

  redisSub.subscribe(TICK_CHANNEL, ALGO_CHANNEL);
  redisSub.on('message', (channel: string, message: string) => {
    if (channel === TICK_CHANNEL) {
      const data = JSON.parse(message) as object;
      for (const client of quoteClients) {
        client.send({ channel: 'quotes', event: 'tick', data });
      }
      return;
    }

    if (channel === ALGO_CHANNEL) {
      const payload = JSON.parse(message) as {
        deploymentId: string;
        event: string;
        data: object;
      };
      for (const client of algoClients) {
        if (
          client.algoDeployments.size === 0 ||
          client.algoDeployments.has(payload.deploymentId)
        ) {
          client.send({
            channel: `algo:${payload.deploymentId}`,
            event: payload.event,
            data: payload.data,
          });
        }
      }
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ws', { websocket: true }, (socket, req) => {
    const token = new URL(req.url, 'http://localhost').searchParams.get('token');
    if (!token && JWT_SECRET !== 'dev-secret') {
      socket.close(4001, 'Unauthorized');
      return;
    }

    const client: WsClient = {
      algoDeployments: new Set(),
      send: (payload) => {
        if (socket.readyState === 1) socket.send(JSON.stringify(payload));
      },
    };

    quoteClients.add(client);
    algoClients.add(client);

    socket.on('close', () => {
      quoteClients.delete(client);
      algoClients.delete(client);
    });

    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          action?: string;
          instrumentIds?: string[];
          deploymentId?: string;
        };

        if (msg.action === 'subscribe') {
          client.send({
            channel: 'quotes',
            event: 'subscribed',
            data: { instrumentIds: msg.instrumentIds ?? [] },
          });
        }

        if (msg.action === 'subscribe_algo' && msg.deploymentId) {
          client.algoDeployments.add(msg.deploymentId);
          client.send({
            channel: `algo:${msg.deploymentId}`,
            event: 'subscribed',
            data: { deploymentId: msg.deploymentId },
          });
        }
      } catch {
        // ignore
      }
    });
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`WebSocket hub listening on port ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
