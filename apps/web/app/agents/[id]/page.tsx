import { notFound } from "next/navigation";

import { getActivity } from "../../../lib/events";
import { getChain } from "../../../lib/grounded";
import { Grounded, NotDeployed, Reviewer, Tx, usdc } from "../../ui";

export const dynamic = "force-dynamic";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,78}$/.test(id)) notFound();
  const chain = getChain();
  if (!chain) return <NotDeployed />;

  const agentId = BigInt(id);
  const [s, wallet, activity] = await Promise.all([
    chain.grounded.score(agentId),
    chain.grounded.payoutWallet(agentId),
    getActivity(chain),
  ]);
  const receipts = activity.receipts.filter((r) => r.agentId === agentId).reverse();
  const ratings = activity.ratings.filter((r) => r.agentId === agentId).reverse();
  const payers = new Set(receipts.map((r) => r.payer)).size;
  // Counted by the contract, but revoked at ERC-8004: it stays in the score until someone calls sweepRevoked.
  const pending = ratings.filter(
    (r) => r.live && activity.revoked.has(`${r.agentId}:${r.reviewer.toLowerCase()}:${r.feedbackIndex}`),
  );
  const total = receipts.reduce((sum, r) => sum + r.amount, 0n);
  const gap = s.rawScore !== null && s.confidence !== "none" ? s.rawScore - s.score : null;

  return (
    <>
      <h1>Agent #{id}</h1>
      <div className="scores">
        <div className="card grounded">
          <div className="muted">Grounded score</div>
          <div className="big">
            <Grounded s={s} />
          </div>
          <div className="muted">
            {plural(s.reviewers, "paying reviewer")} · {s.confidence}
          </div>
        </div>
        <div className="card">
          <div className="muted">Raw ERC-8004 score</div>
          <div className="big">{s.rawScore ?? "–"}</div>
          <div className="muted">every rating, paid or not</div>
        </div>
      </div>
      {gap !== null && gap >= 20 && (
        <p className="warn">
          The raw score is {gap} points above the grounded one: most of this agent&apos;s rating comes from reviewers
          who never paid it.
        </p>
      )}

      {pending.length > 0 && (
        <p className="warn">
          {plural(pending.length, "rating")} still count{pending.length === 1 ? "s" : ""} toward this score although the
          reviewer revoked the feedback behind {pending.length === 1 ? "it" : "them"}. Anyone can remove{" "}
          {pending.length === 1 ? "it" : "them"} by calling <code>sweepRevoked(agentId, reviewer)</code> on
          GroundedReputation: {pending.map((r) => r.reviewer).join(", ")}.
        </p>
      )}

      <div className="card facts">
        <span className="muted">Paid through Grounded</span>
        <span>
          {usdc(total)} USDC in {plural(receipts.length, "receipt")} from {plural(payers, "distinct payer")}
        </span>
        <span className="muted">Behind a rating</span>
        <span>
          {s.paid} USDC in {plural(s.receipts, "receipt")}
        </span>
        <span className="muted">Payout wallet</span>
        <span className="mono">{wallet ?? "none set (cannot be paid)"}</span>
        <span className="muted">Owner changed</span>
        <span>{s.ownerChangedAt ? s.ownerChangedAt.toISOString() : "not since its first grounded rating"}</span>
        <span className="muted">Disputes</span>
        <span>{s.disputes}</span>
        <span className="muted">Last rating</span>
        <span>{s.updatedAt ? s.updatedAt.toISOString() : "–"}</span>
      </div>

      <h2>Grounded ratings</h2>
      {ratings.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reviewer</th>
                <th className="num">Score</th>
                <th className="num">Weight</th>
                <th className="num">Receipt</th>
                <th>Status</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {ratings.map((r) => (
                <tr key={`${r.tx}${r.reviewer}`}>
                  <td>
                    <Reviewer address={r.reviewer} />
                  </td>
                  <td className="num">{r.isDispute ? "dispute" : r.score}</td>
                  <td className="num">{r.weight}</td>
                  <td className="num">{String(r.receiptId)}</td>
                  <td>
                    {!r.live ? (
                      <span className="muted">replaced or swept</span>
                    ) : activity.revoked.has(`${r.agentId}:${r.reviewer.toLowerCase()}:${r.feedbackIndex}`) ? (
                      <span className="warn">revoked, pending sweep</span>
                    ) : (
                      "live"
                    )}
                  </td>
                  <td>
                    <Tx hash={r.tx} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Receipts</h2>
      {receipts.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">Receipt</th>
                <th>Payer</th>
                <th className="num">USDC</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={String(r.id)}>
                  <td className="num">{String(r.id)}</td>
                  <td>
                    <Reviewer address={r.payer} />
                  </td>
                  <td className="num">{usdc(r.amount)}</td>
                  <td>
                    <Tx hash={r.tx} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
