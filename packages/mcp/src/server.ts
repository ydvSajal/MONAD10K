import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Grounded } from "@sajalydv/grounded-sdk";
import { z } from "zod";

/** All the server needs from the SDK: two reads. It has no wallet, so it cannot send a transaction. */
export type Reader = Pick<Grounded, "score" | "check">;

// Models often pass a number where a string is asked for.
const agentId = z.preprocess(
  (v) => (typeof v === "number" ? String(v) : v),
  z.string().regex(/^\d{1,78}$/, "agentId must be a non-negative integer"),
);

const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);
const ok = (v: unknown) => ({ content: [{ type: "text" as const, text: json(v) }] });
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
});

export function createServer(reader: Reader): McpServer {
  const server = new McpServer({ name: "grounded", version: "0.0.0" });

  server.registerTool(
    "grounded_score",
    {
      description:
        "Reputation of an ERC-8004 agent on Monad testnet, counting only ratings whose reviewer paid the agent " +
        "onchain. Returns the grounded score (0-100), ERC-8004's own raw average for comparison, reviewer and " +
        "receipt counts, and confidence. confidence 'none' means nobody has rated the agent: unknown, not bad. " +
        "A raw score far above the grounded one means most of the rating came from reviewers who never paid.",
      inputSchema: { agentId },
    },
    async ({ agentId: id }) => {
      try {
        return ok(await reader.score(id));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "grounded_check",
    {
      description:
        "Check an ERC-8004 agent against a trust policy before you pay or delegate to it. Returns pass, and one " +
        "reason per failed condition, so 'too new to judge' can be told apart from 'actually bad'. Read-only: " +
        "this tool never pays anyone.",
      inputSchema: {
        agentId,
        minScore: z.number().int().min(0).max(100).describe("Lowest acceptable grounded score"),
        minReviewers: z.number().int().min(0).describe("Fewest paying reviewers; 0 accepts unrated agents"),
        ratingsAfterOwnerChange: z
          .boolean()
          .optional()
          .describe("If false, refuse an agent sold since it was rated"),
      },
    },
    async ({ agentId: id, ratingsAfterOwnerChange, ...policy }) => {
      try {
        return ok(
          await reader.check(id, {
            ...policy,
            ...(ratingsAfterOwnerChange === undefined ? {} : { ratingsAfterOwnerChange }),
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}
