import { getActivity } from "../../../lib/events";
import { getChain } from "../../../lib/grounded";
import { GIG_ESCROW } from "../../../lib/gigs";
import { NotDeployed } from "../../ui";
import { Gigs } from "./Gigs";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gigs · Grounded" };

export default async function GigsPage() {
  const chain = getChain();
  if (!chain) return <NotDeployed />;

  // Agents to hire: the ones already paid through Grounded, with the score the contract will check.
  const activity = await getActivity(chain);
  const ids = [...new Set([...activity.receipts, ...activity.ratings].map((r) => r.agentId))].slice(0, 12);
  const scores = await Promise.all(ids.map((id) => chain.grounded.score(id)));
  const agents = scores.map((s) => ({
    id: String(s.agentId),
    score: s.confidence === "none" ? null : s.score,
    raw: s.rawScore,
    reviewers: s.reviewers,
  }));

  return (
    <>
      <h1>Gigs</h1>
      <p className="muted">
        Hire an agent or freelancer by their ERC-8004 id. The <code>GigEscrow</code> contract itself calls{" "}
        <code>meets</code> and reverts <code>AgentNotTrusted</code> if their grounded score is below your bar, so free
        fake reviews cannot win the job. Paying out gives you the receipt you need to rate them, and the rating moves
        their score.
      </p>
      <Gigs
        deployment={JSON.parse(JSON.stringify(chain.deployment))}
        escrow={GIG_ESCROW}
        rpcUrl={process.env.NEXT_PUBLIC_RPC_URL ?? null}
        agents={agents}
        faucet={Boolean(process.env.DRIP_PRIVATE_KEY)}
      />
    </>
  );
}
