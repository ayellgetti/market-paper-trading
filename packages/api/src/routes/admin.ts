import type { FastifyInstance } from 'fastify';
import { SettlementService } from '@paper-trading/oms';
import { prisma } from '@paper-trading/db';

const settlement = new SettlementService(prisma);

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post('/square-off-mis', { preHandler: [app.authenticate] }, async () => {
    const closed = await settlement.squareOffMisPositions();
    return { closed, message: `${closed} MIS positions squared off` };
  });

  app.post('/settle-cnc', { preHandler: [app.authenticate] }, async () => {
    const settled = await settlement.settleCncHoldings();
    return { settled, message: `${settled} CNC positions settled to holdings` };
  });
}
