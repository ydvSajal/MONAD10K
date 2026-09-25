const hits = new Map<string, number[]>();

/**
 * Seconds until `key` may call again, or 0 if it may now: at most `max` calls per `windowMs`.
 * ponytail: per server instance, so the effective limit is `max` times the instances running. A shared
 * limit (Vercel Firewall rule, Upstash) is the upgrade if this API is ever hammered.
 */
export function retryAfter(key: string, max = 60, windowMs = 60_000, now = Date.now()): number {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return Math.ceil((recent[0]! + windowMs - now) / 1000);
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.delete(hits.keys().next().value!); // bound memory under a wide scan
  return 0;
}
