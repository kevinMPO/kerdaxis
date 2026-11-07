/** IP du client derrière Cloudflare (tunnel) ; sinon une clé commune « local ». */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
