import Link from "next/link";

import { getActivity } from "../lib/events";
import { getChain } from "../lib/grounded";
import { Motion } from "./Motion";
import { explorer, short, usdc } from "./ui";

export const dynamic = "force-dynamic";

/** Scored on the landing page: the most recently rated agents, so one request stays a handful of reads. */
const FEATURE_WINDOW = 12;

/** Shown until testnet has a real gap: the seeded fork run from the Quickstart (agent 1932, 20 vs 87). */
const EXAMPLE = { agentId: 1932n, score: 20, raw: 87 };

const STEPS = [
  {
    verb: "Pay",
    body: "The buyer pays the agent's ERC-8004 wallet in USDC through ReceiptRouter. The router records a one-use receipt.",
  },
  {
    verb: "Rate",
    body: "The reviewer posts ERC-8004 feedback and grounds it with a passkey signature, checked onchain by the P256 precompile. One receipt, one rating.",
  },
  {
    verb: "Score",
    body: "GroundedReputation keeps a weighted median of paid ratings. Anyone reads it with scoreOf or meets. No admin key, no offchain server.",
  },
];

const SNIPPET = `const g = new Grounded({ chain: "monad-testnet", addresses });

const { pass, reasons, score } = await g.check(1932n, { minScore: 70, minReviewers: 3 });
// pass: false
// reasons: ["2 reviewers, policy wants 3", "score 20, policy wants 70"]
// score.score 20, score.rawScore 87`;

export default async function Landing() {
  const chain = getChain();
  const activity = chain ? await getActivity(chain) : null;

  const live = activity?.ratings.filter((r) => r.live && !r.isDispute) ?? [];
  const counters: [string, string | number][] = activity?.ratings.length
    ? [
        ["Agents rated", new Set(activity.ratings.map((r) => r.agentId)).size],
        ["Paying reviewers", new Set(activity.ratings.map((r) => r.reviewer)).size],
        ["Live ratings", live.length],
        ["USDC paid through Grounded", usdc(activity.receipts.reduce((sum, r) => sum + r.amount, 0n))],
      ]
    : [];

  // The demo in one panel: the agent whose raw ERC-8004 score is furthest above its grounded one.
  let gap: typeof EXAMPLE | null = null;
  if (chain && activity) {
    const recent = [...new Set(activity.ratings.map((r) => r.agentId).reverse())].slice(0, FEATURE_WINDOW);
    for (const s of await Promise.all(recent.map((id) => chain.grounded.score(id)))) {
      if (s.rawScore === null || s.confidence === "none") continue;
      if (!gap || s.rawScore - s.score > gap.raw - gap.score) gap = { agentId: s.agentId, score: s.score, raw: s.rawScore };
    }
  }
  const featured = gap && gap.raw - gap.score >= 20 ? gap : null;
  const shown = featured ?? EXAMPLE;

  const contracts = chain
    ? ([
        ["ReceiptRouter", chain.deployment.receiptRouter],
        ["ReceiptRegistry", chain.deployment.receiptRegistry],
        ["ReviewerRegistry", chain.deployment.reviewerRegistry],
        ["GroundedReputation", chain.deployment.groundedReputation],
      ] as const)
    : [];

  return (
    <div className="min-h-[100dvh] bg-ink font-sans text-[16px] leading-normal text-paper antialiased">
      <Motion>
        <nav className="sticky top-0 z-10 border-b border-line/60 bg-ink/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-8">
            <Link href="/" className="mr-auto text-lg font-semibold tracking-tight text-paper no-underline">
              Grounded
            </Link>
            {([["Agents", "/agents"], ["Playground", "/playground"], ["Docs", "/docs"]] as const).map(
              ([label, href]) => (
                <Link key={href} href={href} className="text-sm text-mute no-underline transition-colors hover:text-paper">
                  {label}
                </Link>
              ),
            )}
          </div>
        </nav>

        {/* Hero: the claim on the left, the proof on the right. */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-monad/20 blur-[120px]"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 md:grid-cols-[1.15fr_1fr] md:px-8 md:pb-28 md:pt-24">
            <div>
              <h1 data-hero className="m-0 text-4xl font-semibold leading-[1.05] tracking-tighter md:text-6xl">
                A rating counts only if the reviewer <span className="text-monad">paid.</span>
              </h1>
              <p data-hero className="mb-0 mt-6 max-w-[46ch] text-lg leading-relaxed text-mute">
                Reputation for ERC-8004 agents on Monad, built only from ratings backed by an onchain payment.
              </p>
              <div data-hero className="mt-10 flex flex-wrap gap-3">
                <Link
                  href="/agents"
                  className="rounded-full bg-monad px-6 py-3 text-sm font-semibold text-ink no-underline transition hover:brightness-110 active:scale-[0.98]"
                >
                  Browse agents
                </Link>
                <Link
                  href="/docs/quickstart"
                  className="rounded-full border border-line px-6 py-3 text-sm font-semibold text-paper no-underline transition hover:border-monad active:scale-[0.98]"
                >
                  Quickstart
                </Link>
              </div>
            </div>

            <div data-hero className="rounded-2xl border border-line bg-panel/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:p-8">
              <div className="flex items-baseline justify-between gap-4 text-sm text-mute">
                <span>
                  {featured ? (
                    <Link href={`/agents/${shown.agentId}`} className="text-paper">
                      Agent #{String(shown.agentId)}
                    </Link>
                  ) : (
                    <>Agent #{String(shown.agentId)}</>
                  )}
                </span>
                <span>{featured ? "Live on testnet" : "Seeded fork run"}</span>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-mute">ERC-8004 raw</div>
                  <div className="mt-2 font-mono text-6xl font-medium tabular-nums text-mute/70 md:text-7xl">{shown.raw}</div>
                  <div className="mt-2 text-sm text-mute">anyone can post, free</div>
                </div>
                <div>
                  <div className="text-sm text-mute">Grounded</div>
                  <div
                    data-count={shown.score}
                    data-from={shown.raw}
                    className="mt-2 font-mono text-6xl font-medium tabular-nums text-monad md:text-7xl"
                  >
                    {shown.score}
                  </div>
                  <div className="mt-2 text-sm text-mute">paid ratings only</div>
                </div>
              </div>
              <p className="mb-0 mt-8 border-t border-line pt-5 text-sm leading-relaxed text-mute">
                Same agent, same moment. The gap is free feedback that never paid for the service it rates.
              </p>
            </div>
          </div>
        </section>

        {/* Live counters, or an honest empty state. */}
        <section className="border-y border-line bg-panel/40">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-8">
            {counters.length ? (
              <dl className="m-0 grid grid-cols-2 gap-8 md:grid-cols-4">
                {counters.map(([label, value]) => (
                  <div key={label} data-reveal>
                    <dt className="text-sm text-mute">{label}</dt>
                    <dd className="m-0 mt-2 font-mono text-3xl tabular-nums md:text-4xl">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div data-reveal className="flex flex-wrap items-center justify-between gap-4">
                <p className="m-0 text-lg">
                  {chain ? "Contracts are live on Monad testnet. No paid ratings yet." : "Not deployed yet."}
                </p>
                {chain && (
                  <Link href="/playground" className="text-sm font-semibold text-monad no-underline hover:underline">
                    Rate an agent in the playground
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>

        {/* How it works: sticky claim, steps drawn on scroll. */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-24 md:grid-cols-[1fr_1.3fr] md:px-8 md:py-32">
          <div className="md:sticky md:top-28 md:self-start">
            <h2 className="m-0 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              Three onchain steps. Nobody in the middle.
            </h2>
            <p className="mb-0 mt-4 max-w-[40ch] leading-relaxed text-mute">
              Every rating traces back to a payment and a passkey. A sybil has to pay the agent for each fake review.
            </p>
          </div>
          <ol data-steps className="relative m-0 list-none space-y-14 p-0 pl-10">
            <span aria-hidden data-line className="absolute bottom-2 left-[7px] top-2 w-px bg-monad/70" />
            {STEPS.map((s) => (
              <li key={s.verb} data-reveal className="relative">
                <span aria-hidden className="absolute -left-10 top-2 h-[15px] w-[15px] rounded-full border-2 border-monad bg-ink" />
                <h3 className="m-0 text-2xl font-semibold tracking-tight">{s.verb}</h3>
                <p className="mb-0 mt-3 max-w-[52ch] leading-relaxed text-mute">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* SDK: the integration is one call. */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-24 md:px-8 md:py-32">
            <h2 data-reveal className="m-0 text-3xl font-semibold tracking-tight md:text-4xl">
              Check an agent before you pay it.
            </h2>
            <p data-reveal className="mb-0 mt-4 max-w-[60ch] leading-relaxed text-mute">
              <code className="font-mono text-paper">@grounded/sdk</code> returns every failed policy reason, and treats an
              unrated agent as unknown, not bad.
            </p>
            <pre
              data-reveal
              className="mt-10 overflow-x-auto rounded-2xl border border-line bg-panel p-6 font-mono text-[13px] leading-relaxed text-paper md:p-8 md:text-sm"
            >
              <code>{SNIPPET}</code>
            </pre>
          </div>
        </section>

        {/* Contracts: real addresses, no admin keys. */}
        {contracts.length > 0 && (
          <section className="border-t border-line bg-panel/40">
            <div className="mx-auto max-w-6xl px-4 py-24 md:px-8">
              <h2 data-reveal className="m-0 text-3xl font-semibold tracking-tight md:text-4xl">
                Four contracts. No owner, no proxy.
              </h2>
              <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
                {contracts.map(([name, address]) => (
                  <a
                    key={name}
                    href={`${explorer}/address/${address}`}
                    data-reveal
                    className="group bg-ink p-6 no-underline transition-colors hover:bg-panel"
                  >
                    <div className="font-semibold text-paper">{name}</div>
                    <div className="mt-2 font-mono text-sm text-mute group-hover:text-monad">{short(address)}</div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-20 md:px-8">
            <h2 data-reveal className="m-0 max-w-[22ch] text-3xl font-semibold tracking-tight md:text-4xl">
              See which agents earned their score.
            </h2>
            <Link
              href="/agents"
              className="rounded-full bg-monad px-6 py-3 text-sm font-semibold text-ink no-underline transition hover:brightness-110 active:scale-[0.98]"
            >
              Browse agents
            </Link>
          </div>
        </section>

        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-6 px-4 py-8 text-sm text-mute md:px-8">
            <span className="mr-auto">Grounded on Monad testnet</span>
            <Link href="/docs/threat-model" className="text-mute no-underline hover:text-paper">
              What it does not stop
            </Link>
            <Link href="/docs" className="text-mute no-underline hover:text-paper">
              Docs
            </Link>
          </div>
        </footer>
      </Motion>
    </div>
  );
}
