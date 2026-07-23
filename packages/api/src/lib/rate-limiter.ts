type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (bucket.count >= this.maxRequests) {
      return { allowed: false, retryAfterMs: bucket.resetAt - now };
    }

    bucket.count++;
    return { allowed: true, retryAfterMs: 0 };
  }
}

export const apiRateLimiter = new RateLimiter(100, 60_000);
export const brokerRateLimiter = new RateLimiter(30, 60_000);
