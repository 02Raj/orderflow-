import { RateLimitedException } from './errors';

const hits = new Map<string, number[]>();

export function throttle(key: string, limit: number, windowSec: number): void {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) throw new RateLimitedException();
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (!times.some((t) => now - t < windowMs)) hits.delete(k);
    }
  }
}

export function clientKey(request: Request, suffix: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `${ip}:${suffix}`;
}
