import { getActivity } from "../../../lib/events";
import { getChain } from "../../../lib/grounded";
import { NotDeployed } from "../../ui";
import { Playground } from "./Playground";

export const dynamic = "force-dynamic";

export const metadata = { title: "Playground · Grounded" };

export default async function PlaygroundPage() {
  const chain = getChain();
  if (!chain) return <NotDeployed />;

  // Agents to pick from: the ones already paid through Grounded, newest first.
  const activity = await getActivity(chain);
  const agentIds = [...new Set(activity.receipts.map((r) => String(r.agentId)).reverse())].slice(0, 20);

  return (
    <>
      <h1>Playground</h1>
      <p className="muted">
        Pay an agent, rate it with a passkey, and watch its grounded score move. Everything happens in your browser
        against the contracts; this page holds no keys of its own.
      </p>
      <Playground
        deployment={JSON.parse(JSON.stringify(chain.deployment))}
        rpcUrl={process.env.NEXT_PUBLIC_RPC_URL ?? null}
        agentIds={agentIds}
        faucet={Boolean(process.env.DRIP_PRIVATE_KEY)}
      />
    </>
  );
}
