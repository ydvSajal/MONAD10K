"use client";

import {
  BrowserPasskey,
  Grounded,
  eip3009Abi,
  groundedReputationAbi,
  monadTestnet,
  receiptRouterAbi,
  reviewerRegistryAbi,
  type SavedPasskey,
  type ScoreResult,
} from "@sajalydv/grounded-sdk";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  parseEventLogs,
  parseUnits,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { gigEscrowAbi } from "../../../lib/gigs";
import type { Deployment } from "../../../lib/grounded";

// Same keys as the playground, so a wallet and passkey set up there work here too.
const KEY = "grounded.playground.key";
const PASSKEY = "grounded.playground.passkey";
const explorer = monadTestnet.blockExplorers.default.url;
const FEE_NOTE = "5%";

interface AgentRow {
  id: string;
  score: number | null;
  raw: number | null;
  reviewers: number;
}
interface Props {
  deployment: Deployment;
  escrow: Address;
  rpcUrl: string | null;
  agents: AgentRow[];
  initialAgent?: string;
  faucet: boolean;
}
interface Job {
  id: bigint;
  agentId: bigint;
  amount: bigint;
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

/** The custom error name inside a viem failure, or its short message. */
function reason(e: unknown): string {
  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
      return `${reverted.data.errorName}(${(reverted.data.args ?? []).join(", ")})`;
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

export function Gigs({ deployment, escrow, rpcUrl, agents, initialAgent, faucet }: Props) {
  const [key, setKey] = useState<Hex | null>(null);
  const [passkey, setPasskey] = useState<BrowserPasskey | null>(null);
  const [agentId, setAgentId] = useState(initialAgent ?? agents[0]?.id ?? "");
  const [minScore, setMinScore] = useState(70);
  const [minReviewers, setMinReviewers] = useState(1);
  const [amount, setAmount] = useState("0.10");
  const [rating, setRating] = useState(85);
  const [job, setJob] = useState<Job | null>(null);
  const [receiptId, setReceiptId] = useState<bigint | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [revertTx, setRevertTx] = useState<string | null>(null);
  const [before, setBefore] = useState<ScoreResult | null>(null);
  const [after, setAfter] = useState<ScoreResult | null>(null);
  const [balances, setBalances] = useState<{ mon: string; usdc: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ label: string; hash: string }[]>([]);
  const [hostOk, setHostOk] = useState(true);

  const account = useMemo(() => (key ? privateKeyToAccount(key) : null), [key]);
  const transport = useMemo(() => http(rpcUrl ?? undefined), [rpcUrl]);
  const pub = useMemo(() => createPublicClient({ chain: monadTestnet, transport }), [transport]);
  const wallet = useMemo(
    () => (account ? createWalletClient({ chain: monadTestnet, transport, account }) : null),
    [account, transport],
  );
  const g = useMemo(
    () =>
      new Grounded({
        chain: "monad-testnet",
        ...(rpcUrl ? { rpcUrl } : {}),
        addresses: deployment,
        ...(wallet ? { walletClient: wallet } : {}),
      }),
    [wallet, deployment, rpcUrl],
  );

  useEffect(() => {
    const k = store.get(KEY);
    if (k) setKey(k as Hex);
    const host = window.location.hostname;
    setHostOk(host === deployment.rpId || host.endsWith(`.${deployment.rpId}`));
  }, [deployment.rpId]);

  // A passkey saved against an older deployment is not bound in this registry: check the chain, not storage.
  useEffect(() => {
    if (!account) return;
    const saved = store.get(PASSKEY);
    if (!saved) return setPasskey(null);
    void pub
      .readContract({
        address: deployment.reviewerRegistry,
        abi: reviewerRegistryAbi,
        functionName: "keyOf",
        args: [account.address],
      })
      .then(([qx, qy]) => {
        if (qx === 0n && qy === 0n) {
          store.remove(PASSKEY);
          return setPasskey(null);
        }
        try {
          setPasskey(BrowserPasskey.restore(JSON.parse(saved) as SavedPasskey));
        } catch {
          store.remove(PASSKEY);
        }
      })
      .catch(() => {});
  }, [account, pub, deployment.reviewerRegistry]);

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

  const step = (label: string, hash: string) => setSteps((s) => [...s, { label, hash }]);
  const run = (name: string, fn: () => Promise<void>) => async () => {
    setBusy(name);
    setError(null);
    try {
      await fn();
      await refreshBalances().catch(() => {});
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(null);
    }
  };

  /** Monad bills the gas limit, so every write uses the measured estimate plus 15%. */
  const send = async (label: string, p: { address: Address; abi: Abi; functionName: string; args: unknown[] }) => {
    const estimate = await pub.estimateContractGas({ ...p, account: account! } as never);
    const hash = await wallet!.writeContract({ ...p, gas: (estimate * 115n) / 100n } as never);
    step(label, hash);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    return receipt;
  };

  const createWallet = run("wallet", async () => {
    const k = generatePrivateKey();
    store.set(KEY, k);
    store.remove(PASSKEY);
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
    const created = await BrowserPasskey.create({ rpId: deployment.rpId, name: "Grounded gigs" });
    step("bind passkey", await g.bindPasskey(created));
    store.set(PASSKEY, JSON.stringify(created));
    setPasskey(created);
  });

  const hireArgs = () => {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);
    return [BigInt(agentId), parseUnits(amount, 6), minScore, minReviewers, deadline] as const;
  };

  const hire = run("hire", async () => {
    setRefused(null);
    setRevertTx(null);
    setJob(null);
    setReceiptId(null);
    setAfter(null);
    setBefore(await g.score(agentId));

    // The same call the escrow makes. Asking first costs nothing and tells the client why.
    const ok = await pub.readContract({
      address: deployment.groundedReputation,
      abi: groundedReputationAbi,
      functionName: "meets",
      args: [BigInt(agentId), minScore, minReviewers],
    });
    if (!ok) {
      setRefused(
        `GroundedReputation.meets(${agentId}, ${minScore}, ${minReviewers}) is false, so GigEscrow will refuse this hire.`,
      );
      return;
    }

    const [id, value, , , deadline] = hireArgs();
    const fee = await pub.readContract({ address: escrow, abi: gigEscrowAbi, functionName: "feeOf", args: [value] });
    const allowance = await pub.readContract({
      address: deployment.usdc,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account!.address, escrow],
    });
    if (allowance < value + fee) {
      await send("approve USDC to the escrow", {
        address: deployment.usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [escrow, value + fee],
      });
    }
    const receipt = await send(`hire agent #${agentId}: lock ${amount} USDC + ${FEE_NOTE} fee`, {
      address: escrow,
      abi: gigEscrowAbi,
      functionName: "hire",
      args: [id, value, minScore, minReviewers, deadline],
    });
    const hired = parseEventLogs({ abi: gigEscrowAbi, eventName: "JobHired", logs: receipt.logs })[0];
    if (!hired) throw new Error("no JobHired event");
    setJob({ id: hired.args.jobId, agentId: hired.args.agentId, amount: hired.args.amount });
  });

  /** Sends the refused hire anyway, with a fixed gas limit, so the contract's revert is on chain for anyone to read. */
  const hireAnyway = run("hire (refused)", async () => {
    const hash = await wallet!.writeContract({
      address: escrow,
      abi: gigEscrowAbi,
      functionName: "hire",
      args: hireArgs(),
      gas: 400_000n,
    } as never);
    step(`hire agent #${agentId} (the contract refuses)`, hash);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status === "success") throw new Error("the hire went through: the agent passed after all");
    setRevertTx(hash);
  });

  const release = run("release", async () => {
    const j = job!;
    const [name, version, block, chainId, nonceSalt] = await Promise.all([
      pub.readContract({ address: deployment.usdc, abi: eip3009Abi, functionName: "name" }),
      pub.readContract({ address: deployment.usdc, abi: eip3009Abi, functionName: "version" }),
      pub.getBlock(),
      pub.getChainId(),
      Promise.resolve(toHex(crypto.getRandomValues(new Uint8Array(32)))),
    ]);
    const validBefore = block.timestamp + 3600n;
    const nonce = await pub.readContract({
      address: deployment.receiptRouter,
      abi: receiptRouterAbi,
      functionName: "authorizationNonce",
      args: [j.agentId, nonceSalt],
    });
    // The escrow hands the amount back to you and the router pulls it onward in the same transaction, so the
    // receipt names you as the payer. The authorization is to the router and only for this agent.
    const signature = await wallet!.signTypedData({
      account: account!,
      domain: { name, version, chainId, verifyingContract: deployment.usdc },
      types: {
        ReceiveWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "ReceiveWithAuthorization",
      message: {
        from: account!.address,
        to: deployment.receiptRouter,
        value: j.amount,
        validAfter: 0n,
        validBefore,
        nonce,
      },
    });
    const receipt = await send("release: pay the freelancer through the router", {
      address: escrow,
      abi: gigEscrowAbi,
      functionName: "release",
      args: [j.id, 0n, validBefore, nonceSalt, signature],
    });
    const released = parseEventLogs({ abi: gigEscrowAbi, eventName: "JobReleased", logs: receipt.logs })[0];
    if (!released) throw new Error("no JobReleased event");
    setReceiptId(released.args.receiptId);
    setJob(null);
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
    setJob(null);
    setReceiptId(null);
    setRefused(null);
    setRevertTx(null);
    setBefore(null);
    setAfter(null);
    setSteps([]);
    setBalances(null);
  };

  const scoreLine = (s: ScoreResult) => (s.confidence === "none" ? "unrated" : `${s.score}`);
  const canHire = Boolean(account && agentId && /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) >= 0.01 && !job);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {!hostOk && (
        <p className="card warn">
          This deployment&apos;s passkeys are scoped to <code>{deployment.rpId}</code>, and you are on{" "}
          <code>{typeof window === "undefined" ? "" : window.location.hostname}</code>. Creating a passkey here will
          fail. Open this page on {deployment.rpId}.
        </p>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Agents you can hire</h2>
        {agents.length === 0 ? (
          <p className="muted">No agent has been paid through Grounded on this deployment yet. Type any id below.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th className="num">Grounded</th>
                  <th className="num">Raw ERC-8004</th>
                  <th className="num">Reviewers</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/agents/${a.id}`}>#{a.id}</Link>
                    </td>
                    <td className="num">{a.score ?? <span className="muted">unrated</span>}</td>
                    <td className="num">{a.raw ?? "–"}</td>
                    <td className="num">{a.reviewers}</td>
                    <td>
                      <button className="muted" onClick={() => setAgentId(a.id)}>
                        pick
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>1. A wallet and a passkey</h2>
        <p className="muted">
          A throwaway browser key and a real WebAuthn passkey, shared with the playground. Testnet only.
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
          <p className="muted">No faucet here: send MON and testnet USDC to the address above yourself.</p>
        )}
        {account &&
          (passkey ? (
            <p data-testid="passkey-bound">Passkey bound to this wallet.</p>
          ) : (
            <button onClick={bind} disabled={busy !== null || !hostOk}>
              Create passkey and bind it
            </button>
          ))}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>2. Hire</h2>
        <p>
          <label>
            Agent id{" "}
            <input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              aria-label="Agent id"
            />
          </label>{" "}
          <label>
            Pay (USDC){" "}
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount" />
          </label>
        </p>
        <p>
          <label>
            Min grounded score{" "}
            <input
              type="number"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
              aria-label="Minimum score"
            />
          </label>{" "}
          <label>
            Min paying reviewers{" "}
            <input
              type="number"
              min={0}
              value={minReviewers}
              onChange={(e) => setMinReviewers(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              aria-label="Minimum reviewers"
            />
          </label>
        </p>
        <p className="muted">
          The escrow locks the payment plus a {FEE_NOTE} fee. The fee is not refunded on release; it is what a fake
          client pays to run a wash job against their own agent.
        </p>
        <button onClick={hire} disabled={busy !== null || !canHire}>
          Hire
        </button>
        {refused && (
          <div className="card warn" data-testid="refused" style={{ marginTop: 12 }}>
            <p style={{ marginTop: 0 }}>{refused}</p>
            {revertTx ? (
              <p data-testid="reverted">
                Sent anyway: the contract reverted on chain, {tx(revertTx)}. Nothing moved.
              </p>
            ) : (
              <button onClick={hireAnyway} disabled={busy !== null}>
                Send it anyway and watch the contract revert
              </button>
            )}
          </div>
        )}
        {job && (
          <p data-testid="job">
            Job #{String(job.id)}: {formatUnits(job.amount, 6)} USDC locked for agent #{String(job.agentId)}.
          </p>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>3. Release and rate</h2>
        <p className="muted">
          Releasing signs one USDC authorization to the router. The freelancer is paid, and the receipt names you, so
          you can rate them.
        </p>
        <button onClick={release} disabled={busy !== null || !job}>
          Release payment
        </button>
        {receiptId && <p data-testid="receipt">Receipt #{String(receiptId)}</p>}
        <p>
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
        </p>
        {before && (
          <p>
            Grounded score for #{agentId}: <strong data-testid="before-score">{scoreLine(before)}</strong>
            {after && (
              <>
                {" "}
                to <strong data-testid="after-score">{scoreLine(after)}</strong> ({after.reviewers} paying reviewer
                {after.reviewers === 1 ? "" : "s"}) · <Link href={`/agents/${agentId}`}>see the agent page</Link>
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
      <p className="muted">
        Escrow contract:{" "}
        <a href={`${explorer}/address/${escrow}#code`} className="mono">
          {escrow}
        </a>
        . No owner, no arbiter: only the client releases, and takes the money back after the deadline.
      </p>
    </div>
  );
}
