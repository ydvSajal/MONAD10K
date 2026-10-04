import Link from "next/link";

import { getActivity } from "../../../lib/events";
import { getChain } from "../../../lib/grounded";
import { Grounded, NotDeployed } from "../../ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const chain = getChain();
  if (!chain) return <NotDeployed />;

  const activity = await getActivity(chain);
  const ids = [...new Set([...activity.receipts, ...activity.ratings].map((r) => r.agentId))].sort((a, b) =>
    a < b ? -1 : 1,
  );
  const scores = await Promise.all(ids.map((id) => chain.grounded.score(id)));

  return (
    <>
      <h1>Agents</h1>
      <p className="muted">
        The raw score is ERC-8004&apos;s average over every rating, paid or not. The grounded score is the weighted
        median of ratings backed by an onchain payment through Grounded&apos;s router, one per reviewer.
      </p>
      {scores.length === 0 ? (
        <p className="card muted">No agent has been paid through Grounded yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th className="num">Grounded</th>
                <th className="num">Raw ERC-8004</th>
                <th className="num">Reviewers</th>
                <th className="num">Paid behind ratings (USDC)</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => (
                <tr key={String(s.agentId)}>
                  <td>
                    <Link href={`/agents/${s.agentId}`}>#{String(s.agentId)}</Link>
                  </td>
                  <td className="num">
                    <Grounded s={s} />
                  </td>
                  <td className="num">{s.rawScore ?? "–"}</td>
                  <td className="num">{s.reviewers}</td>
                  <td className="num">{s.paid}</td>
                  <td>{s.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">Indexed up to block {String(activity.toBlock)}. Scores are read live from the contract.</p>
    </>
  );
}
