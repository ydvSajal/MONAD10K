import { getChain } from "../../../../../../lib/grounded";
import { retryAfter } from "../../../../../../lib/ratelimit";

export const dynamic = "force-dynamic";

const CACHE = "public, s-maxage=15, stale-while-revalidate=30";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": status === 200 ? CACHE : "no-store",
      // A public read-only score: any page or agent may call it.
      "access-control-allow-origin": "*",
      ...extra,
    },
  });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const wait = retryAfter(ip);
  if (wait > 0) return json({ error: "rate limit: 60 requests per minute" }, 429, { "retry-after": String(wait) });

  const { id } = await params;
  if (!/^\d{1,78}$/.test(id)) return json({ error: "agent id must be a non-negative integer" }, 400);
  const chain = getChain();
  if (!chain) return json({ error: "Grounded is not deployed on this network yet" }, 503);
  return json(await chain.grounded.score(BigInt(id)));
}
