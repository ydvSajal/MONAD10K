// Needs a Postgres: DATABASE_URL=postgres://... pnpm --filter @grounded/demo-seller check
import assert from "node:assert/strict";

import { postgresReceiptStore } from "./pgStore.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const id = BigInt(Date.now()) * 1_000_000n; // beyond uint64 range is fine: the column is numeric
const store = await postgresReceiptStore(url);
assert.equal(await store.markUsed(id), true, "first use is accepted");
assert.equal(await store.markUsed(id), false, "second use is refused");

const raced = await Promise.all(Array.from({ length: 20 }, () => store.markUsed(id + 1n)));
assert.equal(raced.filter(Boolean).length, 1, "exactly one of 20 concurrent callers wins");

// A second store on the same database (a restart, or another instance) sees the same rows.
assert.equal(await (await postgresReceiptStore(url)).markUsed(id), false, "a new instance remembers");
console.log("postgres receipt store: ok");
process.exit(0);
