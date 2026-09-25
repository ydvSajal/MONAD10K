import Link from "next/link";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";

import { getActivity } from "../../../lib/events";
import { getChain } from "../../../lib/grounded";
import { NotDeployed, Tx, usdc } from "../../ui";

export const dynamic = "force-dynamic";

export default async function ReviewerPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: input } = await params;
  if (!isAddress(input, { strict: false })) notFound();
  const chain = getChain();
  if (!chain) return <NotDeployed />;

  const address = getAddress(input);
  const activity = await getActivity(chain);
  const key = activity.reviewers.get(address);
  const ratings = activity.ratings.filter((r) => r.reviewer === address).reverse();
  const paid = activity.receipts.filter((r) => r.payer === address);

  return (
    <>
      <h1 className="mono">{address}</h1>
      <div className="card facts">
        <span className="muted">Passkey</span>
        <span>
          {key ? (
            <>
              bound, key hash <span className="mono">{key.keyHash.slice(0, 18)}…</span> (<Tx hash={key.tx} />)
            </>
          ) : (
            "none bound: this address cannot ground a rating"
          )}
        </span>
        <span className="muted">Paid</span>
        <span>
          {usdc(paid.reduce((sum, r) => sum + r.amount, 0n))} USDC in {paid.length} receipt
          {paid.length === 1 ? "" : "s"}
        </span>
      </div>

      <h2>Ratings given</h2>
      {ratings.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th className="num">Score</th>
                <th className="num">Weight</th>
                <th>Status</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {ratings.map((r) => (
                <tr key={r.tx}>
                  <td>
                    <Link href={`/agents/${r.agentId}`}>#{String(r.agentId)}</Link>
                  </td>
                  <td className="num">{r.isDispute ? "dispute" : r.score}</td>
                  <td className="num">{r.weight}</td>
                  <td>{r.live ? "live" : <span className="muted">replaced</span>}</td>
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
