import type { BrokerType, PrismaClient } from '@paper-trading/db';
import {
  createBrokerAdapter,
  exchangeZerodhaToken,
  zerodhaLoginUrl,
  type BrokerAdapter,
  type BrokerCredentials,
} from '@paper-trading/broker-adapters';
import { ZerodhaLiveAdapter } from '@paper-trading/broker-adapters';
import { decrypt, encrypt } from '../lib/encryption.js';
import { brokerRateLimiter } from '../lib/rate-limiter.js';

const adapterCache = new Map<string, BrokerAdapter>();

export class BrokerService {
  constructor(private db: PrismaClient) {}

  getZerodhaLoginUrl(): string {
    const apiKey = process.env.ZERODHA_API_KEY;
    if (!apiKey) throw new Error('ZERODHA_API_KEY not configured');
    return zerodhaLoginUrl(apiKey);
  }

  isSimulationEnabled(): boolean {
    return process.env.LIVE_TRADING_SIMULATION !== 'false';
  }

  async connectSimulated(userId: string, brokerType: BrokerType): Promise<{ id: string }> {
    const apiKey = process.env.ZERODHA_API_KEY ?? 'sim_key';
    const accessToken = `sim_${userId}_${Date.now()}`;

    await this.db.brokerConnection.updateMany({
      where: { userId, brokerType, isActive: true },
      data: { isActive: false },
    });

    const conn = await this.db.brokerConnection.create({
      data: {
        userId,
        brokerType,
        apiKey: encrypt(apiKey),
        accessToken: encrypt(accessToken),
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    adapterCache.delete(userId);
    return { id: conn.id };
  }

  async exchangeZerodhaAndStore(userId: string, requestToken: string): Promise<{ id: string }> {
    const apiKey = process.env.ZERODHA_API_KEY;
    const apiSecret = process.env.ZERODHA_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error('Zerodha API credentials not configured on server');
    }

    const session = await exchangeZerodhaToken(apiKey, apiSecret, requestToken);

    await this.db.brokerConnection.updateMany({
      where: { userId, brokerType: 'ZERODHA', isActive: true },
      data: { isActive: false },
    });

    const conn = await this.db.brokerConnection.create({
      data: {
        userId,
        brokerType: 'ZERODHA',
        apiKey: encrypt(apiKey),
        apiSecret: encrypt(apiSecret),
        accessToken: encrypt(session.accessToken),
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    adapterCache.delete(userId);
    return { id: conn.id };
  }

  async listConnections(userId: string) {
    const rows = await this.db.brokerConnection.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      brokerType: r.brokerType,
      isActive: r.isActive,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      simulated: decrypt(r.accessToken).startsWith('sim_'),
    }));
  }

  async disconnect(userId: string, connectionId: string): Promise<void> {
    const conn = await this.db.brokerConnection.findFirst({
      where: { id: connectionId, userId },
    });
    if (!conn) throw new Error('Connection not found');

    await this.db.brokerConnection.update({
      where: { id: connectionId },
      data: { isActive: false },
    });
    adapterCache.delete(userId);
  }

  async getActiveConnection(userId: string, brokerType?: BrokerType) {
    return this.db.brokerConnection.findFirst({
      where: {
        userId,
        isActive: true,
        ...(brokerType ? { brokerType } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getLiveAdapter(userId: string): Promise<ZerodhaLiveAdapter> {
    const limit = brokerRateLimiter.check(`broker:${userId}`);
    if (!limit.allowed) {
      throw new Error(`Broker rate limit exceeded. Retry in ${Math.ceil(limit.retryAfterMs / 1000)}s`);
    }

    const cached = adapterCache.get(userId);
    if (cached && cached.brokerType === 'ZERODHA') {
      return cached as ZerodhaLiveAdapter;
    }

    const conn = await this.getActiveConnection(userId);
    if (!conn) throw new Error('No active broker connection. Connect Zerodha first.');

    const credentials: BrokerCredentials = {
      apiKey: conn.apiKey ? decrypt(conn.apiKey) : '',
      apiSecret: conn.apiSecret ? decrypt(conn.apiSecret) : undefined,
      accessToken: decrypt(conn.accessToken),
      refreshToken: conn.refreshToken ? decrypt(conn.refreshToken) : undefined,
    };

    const adapter = createBrokerAdapter(conn.brokerType) as ZerodhaLiveAdapter;
    await adapter.connect(credentials);
    adapterCache.set(userId, adapter);
    return adapter;
  }

  async syncLivePortfolio(userId: string) {
    const adapter = await this.getLiveAdapter(userId);
    const [positions, funds, orders] = await Promise.all([
      adapter.getPositions?.() ?? [],
      adapter.getFunds?.() ?? { available: 0, used: 0, total: 0 },
      adapter.getOrderBook?.() ?? [],
    ]);
    return { positions, funds, orders };
  }
}
