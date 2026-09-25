# AI agents

Two ways to put Grounded in front of an AI agent. Both are built and tested against the real contracts on a
fork. Neither has been run with a real language model yet (see the end).

## The MCP tool: `@grounded/mcp`

An [MCP](https://modelcontextprotocol.io) server that lets any MCP client (Claude Desktop, Claude Code,
Cursor, your own agent) ask whether an ERC-8004 agent's reputation is payment-grounded.

| Tool | Does |
|---|---|
| `grounded_score` | Grounded score, ERC-8004's raw average, paying reviewers, receipts, confidence, disputes |
| `grounded_check` | Checks an agent against `minScore`, `minReviewers` and optionally `ratingsAfterOwnerChange`; returns `pass` and one reason per failed condition |

**It is read-only by construction.** The server is built from the SDK's two read methods and is never given a
wallet, so no prompt, however clever, can make it move money. It can only look.

Run it (from the repository; not on npm yet):

```bash
GROUNDED_ADDRESSES=deployments/10143.json NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 \
  pnpm --filter @grounded/mcp start
```

A client configuration looks like this (adjust the paths):

```json
{
  "mcpServers": {
    "grounded": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/MONAD10K/packages/mcp", "start"],
      "env": { "GROUNDED_ADDRESSES": "/path/to/MONAD10K/deployments/10143.json" }
    }
  }
}
```

Tested over a real stdio connection against the seeded fork: `grounded_check` on the Sybil-inflated agent
returned `pass: false, reasons: ["score 20, policy wants 70"]`, with grounded 20 next to raw 87.

## A buyer that a model drives, inside limits it cannot change

`apps/demo-buyer/src/agent.ts` gives a language model two tools over a list of candidate sellers:

- `inspect_seller(url)`: price, grounded score, raw score, paying reviewers, confidence, and whether the
  buyer's trust policy would allow buying. It pays nothing.
- `purchase(url)`: pays and fetches, through `withTrust`.

The model chooses which seller to buy from and explains why. **The limits are code, not prompt:**

- The tool schemas accept only the URLs on the candidate list. Anything else is rejected before it runs.
- `purchase` goes through `withTrust`, so an agent that fails the trust policy is refused before any money
  moves, whatever the model decided. A per-request `maxAmount` and a purchase count cap the spend.
- Text that comes back from a seller is passed to the model as data, and the system prompt says to ignore
  instructions in it. That is a mitigation, not a guarantee, which is why the limits above do not depend on it.

This is the reason to have a deterministic trust gate at all: a model can be talked into buying from anyone,
and a payment-grounded gate is the part that cannot.

### Choosing the model

It uses any OpenAI-compatible endpoint (Moonshot/KIMI, Alibaba Qwen and others) through the Vercel AI SDK.
Swapping models is three environment variables:

```bash
AI_BASE_URL=https://api.moonshot.ai/v1   # or your Qwen / other provider's compatible endpoint
AI_MODEL=<model id>
AI_API_KEY=...
BUYER_PRIVATE_KEY=0x...                  # a funded testnet key

pnpm --filter @grounded/demo-buyer agent -- \
  --target http://localhost:8787/insight --target http://localhost:8788/insight
```

The agent code (`agentCore.ts`) takes a model object and imports no provider; only the small entry file
builds one.

## What has and has not been tested

- **Tested:** the MCP server, offline and over stdio against the real contracts. The model-driven buyer with a
  **scripted** model against real sellers on a fork: the script looks at both sellers, asks to fetch a URL off
  the list, asks to buy from the Sybil-inflated seller, then buys from the honest one. The off-list URL was
  never contacted, the Sybil purchase was refused, and exactly one 0.05 USDC payment left the wallet
  (`pnpm --filter @grounded/demo-buyer agent:check`).
- **Not tested:** any real model. That needs an API key and the run has not been done, so nothing here claims
  how KIMI, Qwen or any other model behaves as this buyer, or that swapping between two of them works. The
  scripted test proves the limits hold when the model is wrong; it does not show a model choosing well.
