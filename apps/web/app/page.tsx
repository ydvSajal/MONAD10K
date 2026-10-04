import Link from "next/link";
import { Suspense } from "react";

import { getActivity } from "../lib/events";
import { getChain } from "../lib/grounded";
import { CopyCommand } from "./CopyCommand";
import { Hero } from "./Hero";
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

/** Reads chain logs, which can take a while on a cold start, so it streams in behind the hero. */
async function Live() {
  const chain = getChain();
  // A stalled public RPC must not take the landing page down: show the static parts and say so.
  let failed = false;
  const activity = chain ? await getActivity(chain).catch(() => ((failed = true), null)) : null;

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

  return (
    <>
        {/* Hero: the claim on the left, the proof on the right. */}
        <section className="relative overflow-hidden border-t border-line">
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 md:grid-cols-[1.15fr_1fr] md:px-8 md:pb-28 md:pt-24">
            <div>
              <h2 className="m-0 text-5xl font-semibold leading-[1.05] tracking-[-0.03em] text-balance text-mute md:text-7xl">
                Same agent, <span className="text-paper">two scores.</span>
              </h2>
              <p data-reveal className="mb-0 mt-6 max-w-[46ch] text-xl leading-relaxed text-mute">
                Reputation for ERC-8004 agents on Monad, built only from ratings backed by an onchain payment.
              </p>
              <div data-reveal className="mt-10 flex flex-wrap gap-3">
                <Link
                  href="/agents"
                  className="rounded-full bg-paper px-8 py-4 text-lg font-semibold text-ink no-underline transition hover:bg-white/85 active:scale-[0.98]"
                >
                  Browse agents
                </Link>
                <Link
                  href="/docs/quickstart"
                  className="rounded-full border border-line px-8 py-4 text-lg font-semibold text-paper no-underline transition hover:border-paper active:scale-[0.98]"
                >
                  Quickstart
                </Link>
              </div>
            </div>

            <div data-reveal className="rounded-2xl border border-line bg-panel/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:p-8">
              <div className="flex items-baseline justify-between gap-4 text-base text-mute">
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
                  <div className="text-base text-mute">ERC-8004 raw</div>
                  <div className="mt-2 font-mono text-7xl font-medium tabular-nums text-mute md:text-8xl">{shown.raw}</div>
                  <div className="mt-2 text-base text-mute">anyone can post, free</div>
                </div>
                <div>
                  <div className="text-base text-mute">Grounded</div>
                  <div
                    data-count={shown.score}
                    data-from={shown.raw}
                    className="mt-2 font-mono text-7xl font-medium tabular-nums text-paper md:text-8xl"
                  >
                    {shown.score}
                  </div>
                  <div className="mt-2 text-base text-mute">paid ratings only</div>
                </div>
              </div>
              <p className="mb-0 mt-8 border-t border-line pt-5 text-lg leading-relaxed text-mute">
                Same agent, same moment. The gap is free feedback that never paid for the service it rates.
              </p>
            </div>
          </div>
        </section>

        {/* Live counters, or an honest empty state. */}
        <section className="border-y border-line bg-panel/40">
          <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
            {counters.length ? (
              <dl className="m-0 grid grid-cols-2 gap-8 md:grid-cols-4">
                {counters.map(([label, value]) => (
                  <div key={label} data-reveal>
                    <dt className="text-base text-mute">{label}</dt>
                    <dd className="m-0 mt-2 font-mono text-4xl tabular-nums md:text-6xl">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div data-reveal className="flex flex-wrap items-center justify-between gap-4">
                <p className="m-0 text-xl">
                  {!chain
                    ? "Not deployed yet."
                    : failed
                      ? "The Monad RPC is slow right now. Live numbers will show on the next refresh."
                      : "Contracts are live on Monad testnet. No paid ratings yet."}
                </p>
                {chain && (
                  <Link href="/playground" className="text-base font-semibold text-paper no-underline hover:underline">
                    Rate an agent in the playground
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>

    </>
  );
}

export default function Landing() {
  const chain = getChain();

  const contracts = chain
    ? ([
        ["ReceiptRouter", chain.deployment.receiptRouter],
        ["ReceiptRegistry", chain.deployment.receiptRegistry],
        ["ReviewerRegistry", chain.deployment.reviewerRegistry],
        ["GroundedReputation", chain.deployment.groundedReputation],
      ] as const)
    : [];

  return (
    <div className="min-h-[100dvh] bg-ink font-sans text-[19px] leading-normal text-paper antialiased">
      <Motion>
        <Hero />

        <Suspense fallback={<div className="h-24" aria-hidden />}>
          <Live />
        </Suspense>

        {/* How it works: sticky claim, steps drawn on scroll. */}
        <div className="bg-glow">
        <section id="how" className="mx-auto grid max-w-7xl gap-12 px-4 py-24 md:grid-cols-[1fr_1.3fr] md:px-8 md:py-32">
          <div className="md:sticky md:top-28 md:self-start">
            <h2 className="m-0 text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-balance md:text-5xl">
              Three onchain steps. Nobody in the middle.
            </h2>
            <p className="mb-0 mt-4 max-w-[40ch] text-xl leading-relaxed md:text-2xl text-mute">
              Every rating traces back to a payment and a passkey. A sybil has to pay the agent for each fake review.
            </p>
          </div>
          <ol data-steps className="relative m-0 list-none space-y-14 p-0 pl-10">
            <span aria-hidden data-line className="absolute bottom-2 left-[7px] top-2 w-px bg-paper/40" />
            {STEPS.map((s) => (
              <li key={s.verb} data-reveal className="relative">
                <span aria-hidden className="absolute -left-10 top-2 h-[15px] w-[15px] rounded-full border-2 border-paper bg-ink" />
                <h3 className="m-0 text-3xl font-semibold tracking-tight md:text-4xl">{s.verb}</h3>
                <p className="mb-0 mt-3 max-w-[52ch] text-xl leading-relaxed md:text-2xl text-mute">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        </div>

        {/* SDK: the integration is one call. */}
        <section id="sdk" className="bg-dots border-t border-line">
          <div className="mx-auto max-w-7xl px-4 py-24 md:px-8 md:py-32">
            <h2 data-reveal className="m-0 text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-balance md:text-5xl">
              Check an agent before you pay it.
            </h2>
            <p data-reveal className="mb-0 mt-4 max-w-[60ch] text-xl leading-relaxed md:text-2xl text-mute">
              <code className="font-mono text-paper">@grounded/sdk</code> returns every failed policy reason, and treats an
              unrated agent as unknown, not bad.
            </p>
            <div data-reveal className="mt-10">
              <CopyCommand command="npm install @grounded/sdk" />
              <p className="mb-0 mt-4 text-lg text-mute">
                Goes to npm when the repository goes public. Until then, build it from source with the{" "}
                <Link href="/docs/quickstart" className="text-paper underline">
                  Quickstart
                </Link>
                .
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/docs/sdk"
                  className="rounded-full bg-paper px-8 py-4 text-lg font-semibold text-ink no-underline transition hover:bg-white/85 active:scale-[0.98]"
                >
                  SDK reference
                </Link>
                <Link
                  href="/docs/quickstart"
                  className="rounded-full border border-line px-8 py-4 text-lg font-semibold text-paper no-underline transition hover:border-paper active:scale-[0.98]"
                >
                  Quickstart
                </Link>
              </div>
            </div>
            <pre
              data-reveal
              className="mt-12 overflow-x-auto rounded-2xl border border-line bg-panel p-6 font-mono text-base leading-loose text-paper md:p-10 md:text-[19px]"
            >
              <code>
                {SNIPPET.split("\n").map((line, i) => (
                  <span key={i} className={line.startsWith("//") ? "block text-mute" : "block"}>
                    {line || " "}
                  </span>
                ))}
              </code>
            </pre>
          </div>
        </section>

        {/* Contracts: real addresses, no admin keys. */}
        {contracts.length > 0 && (
          <section className="bg-glow border-t border-line">
            <div className="mx-auto max-w-7xl px-4 py-24 md:px-8">
              <h2 data-reveal className="m-0 text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-balance md:text-5xl">
                Four contracts. No owner, no proxy.
              </h2>
              <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
                {contracts.map(([name, address]) => (
                  <a
                    key={name}
                    href={`${explorer}/address/${address}`}
                    data-reveal
                    className="group bg-ink p-8 no-underline transition-colors hover:bg-panel"
                  >
                    <div className="text-xl font-semibold text-paper md:text-2xl">{name}</div>
                    <div className="mt-3 font-mono text-lg text-mute group-hover:text-paper">{short(address)}</div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="bg-dots border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-24 md:px-8">
            <h2 data-reveal className="m-0 max-w-[22ch] text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-balance md:text-5xl">
              See which agents earned their score.
            </h2>
            <Link
              href="/agents"
              className="rounded-full bg-paper px-8 py-4 text-lg font-semibold text-ink no-underline transition hover:bg-white/85 active:scale-[0.98]"
            >
              Browse agents
            </Link>
          </div>
        </section>

        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-wrap gap-6 px-4 py-10 text-base text-mute md:px-8">
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
