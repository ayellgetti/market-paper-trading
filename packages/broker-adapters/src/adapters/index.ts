import type { BrokerAdapter, BrokerCredentials, BrokerInstrument, BrokerTick } from '../types.js';
import { MockBrokerAdapter } from '../mock.js';
import { ZerodhaLiveAdapter } from '../zerodha.js';

/** OAuth stub — replace with Angel SmartAPI session in production */
export class AngelOneAdapter extends MockBrokerAdapter {
  readonly brokerType = 'ANGEL_ONE' as const;

  override async connect(credentials: BrokerCredentials): Promise<void> {
    if (!credentials.accessToken) throw new Error('Angel One access token required');
    await super.connect(credentials);
  }
}

/** OAuth stub — replace with Upstox API v2 */
export class UpstoxAdapter extends MockBrokerAdapter {
  readonly brokerType = 'UPSTOX' as const;
}

/** OAuth stub — replace with Fyers API v3 */
export class FyersAdapter extends MockBrokerAdapter {
  readonly brokerType = 'FYERS' as const;
}

/** OAuth stub — replace with Dhani API */
export class DhaniAdapter extends MockBrokerAdapter {
  readonly brokerType = 'DHANI' as const;
}

export { ZerodhaLiveAdapter as ZerodhaAdapter };

export function createBrokerAdapter(brokerType: string): BrokerAdapter {
  switch (brokerType) {
    case 'ZERODHA':
      return new ZerodhaLiveAdapter();
    case 'ANGEL_ONE':
      return new AngelOneAdapter();
    case 'UPSTOX':
      return new UpstoxAdapter();
    case 'FYERS':
      return new FyersAdapter();
    case 'DHANI':
      return new DhaniAdapter();
    case 'MOCK':
    default:
      return new MockBrokerAdapter();
  }
}

export type { BrokerAdapter, BrokerCredentials, BrokerInstrument, BrokerTick };
