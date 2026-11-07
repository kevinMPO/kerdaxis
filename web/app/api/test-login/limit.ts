// Anti-force brute simple (mémoire du processus) : 8 essais / 10 min par IP.
const hits = new Map<string, number[]>();

export function rateLimitHit(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 8;
}
