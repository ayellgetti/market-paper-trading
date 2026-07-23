import 'dotenv/config';
import cron from 'node-cron';
import { prisma } from '@paper-trading/db';
import { SettlementService } from '@paper-trading/oms';

const settlement = new SettlementService(prisma);
const enabled = process.env.SCHEDULER_ENABLED !== 'false';

async function runMisSquareOff(): Promise<void> {
  const closed = await settlement.squareOffMisPositions();
  console.log(`[scheduler] MIS square-off complete — ${closed} positions closed`);
}

async function runCncSettlement(): Promise<void> {
  const settled = await settlement.settleCncHoldings();
  console.log(`[scheduler] T+1 CNC settlement — ${settled} positions moved to holdings`);
}

if (enabled) {
  // 3:20 PM IST Mon–Fri — NSE MIS auto square-off
  cron.schedule('20 15 * * 1-5', () => void runMisSquareOff(), { timezone: 'Asia/Kolkata' });

  // Midnight IST — T+1 delivery settlement
  cron.schedule('0 0 * * *', () => void runCncSettlement(), { timezone: 'Asia/Kolkata' });

  console.log('[scheduler] Running — MIS square-off 15:20 IST, CNC settlement 00:00 IST');
} else {
  console.log('[scheduler] Disabled (SCHEDULER_ENABLED=false)');
}

export { runMisSquareOff, runCncSettlement };
