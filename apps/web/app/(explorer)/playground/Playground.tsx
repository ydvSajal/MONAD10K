"use client";

import { BrowserPasskey, Grounded, monadTestnet, type SavedPasskey, type ScoreResult } from "@sajalydv/grounded-sdk";
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { Deployment } from "../../../lib/grounded";

const KEY = "grounded.playground.key";
const PASSKEY = "grounded.playground.passkey";
const AMOUNT = "0.10"; // weight 2: enough to matter, still small
const explorer = monadTestnet.blockExplorers.default.url;

interface Props {
  deployment: Deployment;
  rpcUrl: string | null;
  agentIds: string[];
  faucet: boolean;
}

/** localStorage can throw (private windows, blocked storage): the page must still work without it. */
const store = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {}
  },
  remove: (k: string) => {
    try {
      window.localStorage.removeItem(k);
    } catch {}
  },
};

const tx = (hash: string) => (
  <a href={`${explorer}/tx/${hash}`} className="mono">
    {hash.slice(0, 10)}…
  </a>
);

export function Playground({ deployment, rpcUrl, agentIds, faucet }: Props) {
  const [key, setKey] = useState<Hex | null>(null);
  const [passkey, setPasskey] = useState<BrowserPasskey | null>(null);
  const [agentId, setAgentId] = useState(agentIds[0] ?? "");
  const [receiptId, setReceiptId] = useState<bigint | null>(null);
  const [rating, setRating] = useState(85);
  const [before, setBefore] = useState<ScoreResult | null>(null);
  const [after, setAfter] = useState<ScoreResult | null>(null);
  const [balances, setBalances] = useState<{ mon: string; usdc: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ label: string; hash: string }[]>([]);
  const [hostOk, setHostOk] = useState(true);

  const account = useMemo(() => (key ? privateKeyToAccount(key) : null), [key]);
  const g = useMemo(() => {
    const transport = http(rpcUrl ?? undefined);
    const config = { chain: "monad-testnet" as const, ...(rpcUrl ? { rpcUrl } : {}), addresses: deployment };
    return new Grounded({
      ...config,
      ...(account ? { walletClient: createWalletClient({ chain: monadTestnet, transport, account }) } : {}),
    });
  }, [account, deployment, rpcUrl]);
  const pub = useMemo(() => createPublicClient({ chain: monadTestnet, transport: http(rpcUrl ?? undefined) }), [rpcUrl]);

  useEffect(() => {
    const k = store.get(KEY);
    if (k) setKey(k as Hex);
    const p = store.get(PASSKEY);
    if (p) {
      try {
        setPasskey(BrowserPasskey.restore(JSON.parse(p) as SavedPasskey));
      } catch {
        store.remove(PASSKEY);
      }
    }
    // A passkey works only on the domain the contracts were deployed with (or a subdomain of it).
    const host = window.location.hostname;
    setHostOk(host === deployment.rpId || host.endsWith(`.${deployment.rpId}`));
  }, [deployment.rpId]);

  const refreshBalances = async () => {
    if (!account) return;
    const [mon, usdc] = await Promise.all([
      pub.getBalance({ address: account.address }),
      pub.readContract({ address: deployment.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
    ]);
    setBalances({ mon: formatEther(mon), usdc: formatUnits(usdc, 6) });
  };
  useEffect(() => {
    void refreshBalances().catch(() => setBalances(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const run = (name: string, fn: () => Promise<void>) => async () => {
    setBusy(name);
    setError(null);
    try {
      await fn();
      await refreshBalances().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const step = (label: string, hash: string) => setSteps((s) => [...s, { label, hash }]);

  const createWallet = run("wallet", async () => {
    const k = generatePrivateKey();
    store.set(KEY, k);
    setKey(k);
  });

  const getFunds = run("funds", async () => {
    const res = await fetch("/api/drip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account!.address }),
    });
    const body = (await res.json()) as { error?: string; monTx?: string; usdcTx?: string };
    if (!res.ok) throw new Error(body.error ?? `faucet answered ${res.status}`);
    step("test funds (MON)", body.monTx!);
    step("test funds (USDC)", body.usdcTx!);
  });

  const bind = run("bind", async () => {
    const created = await BrowserPasskey.create({ rpId: deployment.rpId, name: "Grounded playground" });
    step("bind passkey", await g.bindPasskey(created));
    store.set(PASSKEY, JSON.stringify(created));
    setPasskey(created);
  });

  const pay = run("pay", async () => {
    setBefore(await g.score(agentId));
    setAfter(null);
    const paid = await g.pay({ agentId, amount: AMOUNT, mode: "authorization" });
    step(`pay ${AMOUNT} USDC to agent #${agentId}`, paid.txHash);
    setReceiptId(paid.receiptId);
  });

  const rate = run("rate", async () => {
    const done = await g.rate({ receiptId: receiptId!, score: rating, tag: "quality", authenticator: passkey! });
    step("ERC-8004 feedback", done.feedbackTx);
    step("ground the rating", done.groundTx);
    setReceiptId(null);
    setAfter(await g.score(agentId));
  });

  const reset = () => {
    store.remove(KEY);
    store.remove(PASSKEY);
    setKey(null);
    setPasskey(null);
    setReceiptId(null);
    setBefore(null);
    setAfter(null);
    setSteps([]);
    setBalances(null);
  };

  const canPay = Boolean(account && passkey && agentId && !receiptId);
  const scoreLine = (s: ScoreResult) => (s.confidence === "none" ? "unrated" : `${s.score}`);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {!hostOk && (
        <p className="card warn">
          This deployment&apos;s passkeys are scoped to <code>{deployment.rpId}</code>, and you are on{" "}
          <code>{typeof window === "undefined" ? "" : window.location.hostname}</code>. Creating a passkey here will
          fail. Open the playground on {deployment.rpId}.
        </p>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>1. A test wallet</h2>
        <p className="muted">
          A throwaway key kept in this browser&apos;s storage. Testnet only: never send it anything you care about.
        </p>
        {account ? (
          <div className="facts">
            <span className="muted">Address</span>
            <span className="mono" data-testid="address">
              {account.address}
            </span>
            <span className="muted">Balance</span>
            <span data-testid="balance">{balances ? `${balances.mon} MON · ${balances.usdc} USDC` : "…"}</span>
          </div>
        ) : (
          <button onClick={createWallet} disabled={busy !== null}>
            Create test wallet
          </button>
        )}
        {account && faucet && (
          <p>
            <button onClick={getFunds} disabled={busy !== null}>
              Get test funds
            </button>
          </p>
        )}
        {account && !faucet && (
          <p className="muted">
            No faucet on this deployment: send some MON and testnet USDC to the address above yourself.
          </p>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>2. A passkey</h2>
        <p className="muted">
          A real WebAuthn passkey (Touch ID, Windows Hello, a phone). It signs your rating, and the contract checks the
          signature with Monad&apos;s P-256 precompile.
        </p>
        {passkey ? (
          <p data-testid="passkey-bound">Bound to your wallet.</p>
        ) : (
          <button onClick={bind} disabled={busy !== null || !account || !hostOk}>
            Create passkey and bind it
          </button>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>3. Pay an agent</h2>
        <label>
          Agent id{" "}
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value.replace(/\D/g, ""))}
            list="agents"
            inputMode="numeric"
            aria-label="Agent id"
          />
        </label>
        <datalist id="agents">
          {agentIds.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        <p className="muted">
          You pay the agent&apos;s own payout wallet {AMOUNT} USDC through the router. That payment is your receipt.
        </p>
        <button onClick={pay} disabled={busy !== null || !canPay}>
          Pay {AMOUNT} USDC
        </button>
        {receiptId && <p data-testid="receipt">Receipt #{String(receiptId)}</p>}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>4. Rate it</h2>
        <label>
          Score{" "}
          <input
            type="number"
            min={0}
            max={100}
            value={rating}
            onChange={(e) => setRating(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
            aria-label="Score"
          />
        </label>{" "}
        <button onClick={rate} disabled={busy !== null || !receiptId || !passkey}>
          Rate agent
        </button>
        {before && (
          <p>
            Grounded score for #{agentId}: <strong data-testid="before-score">{scoreLine(before)}</strong>
            {after && (
              <>
                {" "}
                to <strong data-testid="after-score">{scoreLine(after)}</strong> ({after.reviewers} paying reviewer
                {after.reviewers === 1 ? "" : "s"})
              </>
            )}
          </p>
        )}
      </section>

      {busy && <p className="muted">Working: {busy}…</p>}
      {error && (
        <p className="card warn" role="alert" data-testid="error">
          {error}
        </p>
      )}
      {steps.length > 0 && (
        <section>
          <h2>Transactions</h2>
          <ul>
            {steps.map((s, i) => (
              <li key={`${s.hash}${i}`}>
                {s.label}: {tx(s.hash)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {account && (
        <p>
          <button onClick={reset} className="muted">
            Start over with a new wallet
          </button>
        </p>
      )}
    </div>
  );
}
