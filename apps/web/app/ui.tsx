import { monadTestnet, type ScoreResult } from "@grounded/sdk";
import Link from "next/link";
import { formatUnits, type Hex } from "viem";

export const explorer = monadTestnet.blockExplorers.default.url;

export const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export const usdc = (units: bigint) => formatUnits(units, 6);

export function Tx({ hash }: { hash: Hex }) {
  return (
    <a href={`${explorer}/tx/${hash}`} className="mono">
      {short(hash)}
    </a>
  );
}

export function Reviewer({ address }: { address: string }) {
  return (
    <Link href={`/reviewers/${address}`} className="mono">
      {short(address)}
    </Link>
  );
}

/** Unrated is not zero: an agent nobody paid to rate has no score, not a bad one. */
export function Grounded({ s }: { s: ScoreResult }) {
  return s.confidence === "none" ? <span className="muted">unrated</span> : <>{s.score}</>;
}

export function NotDeployed() {
  return (
    <section className="card">
      <h2>Not deployed yet</h2>
      <p className="muted">
        Grounded's contracts are not on Monad testnet yet, so there is nothing to explore. Set{" "}
        <code>GROUNDED_ADDRESSES</code> to a deployment to point this explorer at one.
      </p>
    </section>
  );
}
