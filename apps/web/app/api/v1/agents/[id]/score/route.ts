import { getChain } from "../../../../../../lib/grounded";

export const dynamic = "force-dynamic";

// Rate limiting is a Vercel Firewall rule on /api/v1/*, not code here.
const CACHE = "public, s-maxage=30, stale-while-revalidate=60";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status,
    headers: { "content-type": "application/json", "cache-control": status === 200 ? CACHE : "no-store" },
  });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,78}$/.test(id)) return json({ error: "agent id must be a non-negative integer" }, 400);
  const chain = getChain();
  if (!chain) return json({ error: "Grounded is not deployed on this network yet" }, 503);
  return json(await chain.grounded.score(BigInt(id)));
}
