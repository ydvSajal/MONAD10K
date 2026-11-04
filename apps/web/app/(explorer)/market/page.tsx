import Link from "next/link";

import profiles from "../../../content/market.json";
import { getChain } from "../../../lib/grounded";
import { NotDeployed } from "../../ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Market · Grounded" };

interface Profile {
  id: string;
  name: string;
  skill: string;
  rate: string;
  blurb: string;
}

export default async function MarketPage() {
  const chain = getChain();
  if (!chain) return <NotDeployed />;

  const list = profiles as Profile[];
  const scores = await Promise.all(list.map((p) => chain.grounded.score(BigInt(p.id))));

  return (
    <>
      <h1>Market</h1>
      <p className="muted">
        Demo freelancers and agents. Names and rates are written by us; the score is read live from{" "}
        <code>GroundedReputation</code> and counts only ratings backed by an onchain payment. Ratings on the seeded
        agents were made by seeded demo wallets, not real customers. Hire one, release the payment, rate them, and
        watch the number move.
      </p>
      {list.length === 0 ? (
        <p className="card muted">No demo freelancers are listed yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {list.map((p, i) => {
            const s = scores[i]!;
            const isNew = s.confidence === "none";
            return (
              <section className="card" key={p.id}>
                <h2 style={{ marginTop: 0 }}>{p.name}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {p.skill} · {p.rate}
                </p>
                <p>{p.blurb}</p>
                <p style={{ margin: "8px 0" }}>
                  {isNew ? (
                    <strong>New</strong>
                  ) : (
                    <>
                      <strong style={{ fontSize: 28 }}>{s.score}</strong> <span className="muted">grounded</span>
                    </>
                  )}
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  {isNew
                    ? "No paid reviews yet"
                    : `${s.reviewers} paying reviewer${s.reviewers === 1 ? "" : "s"} · raw ERC-8004 ${s.rawScore ?? "–"}`}
                </p>
                <p>
                  <Link href={`/gigs?agent=${p.id}`}>Hire</Link> · <Link href={`/agents/${p.id}`}>Reviews</Link>
                </p>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
