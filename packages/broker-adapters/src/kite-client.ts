import { createHash } from 'node:crypto';
import type { BrokerCredentials, ZerodhaSession } from './types.js';

const KITE_API = 'https://api.kite.trade';

export function zerodhaLoginUrl(apiKey: string): string {
  return `https://kite.zerodha.com/connect/login?api_key=${encodeURIComponent(apiKey)}&v=3`;
}

export function zerodhaChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
  return createHash('sha256').update(`${apiKey}${requestToken}${apiSecret}`).digest('hex');
}

export async function exchangeZerodhaToken(
  apiKey: string,
  apiSecret: string,
  requestToken: string,
): Promise<ZerodhaSession> {
  const checksum = zerodhaChecksum(apiKey, requestToken, apiSecret);
  const body = new URLSearchParams({
    api_key: apiKey,
    request_token: requestToken,
    checksum,
  });

  const res = await fetch(`${KITE_API}/session/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = (await res.json()) as {
    status: string;
    message?: string;
    data?: {
      access_token: string;
      public_token?: string;
      login_time?: string;
      user_id?: string;
      user_name?: string;
    };
  };

  if (json.status !== 'success' || !json.data?.access_token) {
    throw new Error(json.message ?? 'Zerodha token exchange failed');
  }

  return {
    accessToken: json.data.access_token,
    publicToken: json.data.public_token,
    loginTime: json.data.login_time,
    userId: json.data.user_id,
    userName: json.data.user_name,
  };
}

export class KiteClient {
  constructor(
    private apiKey: string,
    private accessToken: string,
  ) {}

  private authHeader(): string {
    return `token ${this.apiKey}:${this.accessToken}`;
  }

  async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${KITE_API}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader(),
        'X-Kite-Version': '3',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json()) as { status: string; message?: string; data?: T };
    if (json.status !== 'success') {
      throw new Error(json.message ?? `Kite API error: ${path}`);
    }
    return json.data as T;
  }

  static fromCredentials(credentials: BrokerCredentials): KiteClient {
    return new KiteClient(credentials.apiKey, credentials.accessToken);
  }
}
