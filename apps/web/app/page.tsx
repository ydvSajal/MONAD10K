import Link from "next/link";

import { getActivity } from "../lib/events";
import { getChain } from "../lib/grounded";
import { NotDeployed, usdc } from "./ui";

export const dynamic = "force-dynamic";

/** Scored on the landing page: the most recently rated agents, so one request stays a handful of reads. */
const FEATURE_WINDOW = 12;

export default async function Landing() {
  const chain = getChain();
  const activity = chain ? await getActivity(chain) : null;

  const live = activity?.ratings.filter((r) => r.live && !r.isDispute) ?? [];
  const counters = activity
    ? [
        ["Agents rated", new Set(activity.ratings.map((r) => r.agentId)).size],
        ["Paying reviewers", new Set(activity.ratings.map((r) => r.reviewer)).size],
        ["Live ratings", live.length],
        ["Paid through Grounded (USDC)", usdc(activity.receipts.reduce((sum, r) => sum + r.amount, 0n))],
      ]
    : [];

  // The demo in one row: the agent whose raw ERC-8004 score is furthest above its grounded one.
  let gap: { agentId: bigint; score: number; raw: number } | null = null;
  if (chain && activity) {
    const recent = [...new Set(activity.ratings.map((r) => r.agentId).reverse())].slice(0, FEATURE_WINDOW);
    for (const s of await Promise.all(recent.map((id) => chain.grounded.score(id)))) {
      if (s.rawScore === null || s.confidence === "none") continue;
      if (!gap || s.rawScore - s.score > gap.raw - gap.score) gap = { agentId: s.agentId, score: s.score, raw: s.rawScore };
    }
  }

  return (
    <>
      <h1>A rating counts only if the reviewer paid.</h1>
      <p className="muted">
        ERC-8004 lets anyone post feedback about any agent for free. Grounded counts only the ratings backed by an
        onchain payment to the agent, signed with a passkey, and computes the score in a contract nobody controls.
      </p>

      {activity ? (
        <div className="scores">
          {counters.map(([label, value]) => (
            <div key={label} className="card">
              <div className="muted">{label}</div>
              <div className="big">{value}</div>
            </div>
          ))}
        </div>
      ) : (
        <NotDeployed />
      )}

      {gap && gap.raw - gap.score >= 20 && (
        <p className="card">
          <strong>
            <Link href={`/agents/${gap.agentId}`}>Agent #{String(gap.agentId)}</Link>
          </strong>{" "}
          reads <strong>{gap.raw}</strong> on ERC-8004 and <strong>{gap.score}</strong> once only paid ratings count.
        </p>
      )}

      <p>
        <Link href="/agents">Browse agents</Link> · <Link href="/docs/quickstart">Quickstart</Link> ·{" "}
        <Link href="/docs/threat-model">What it does not stop</Link>
      </p>
    </>
  );
}
