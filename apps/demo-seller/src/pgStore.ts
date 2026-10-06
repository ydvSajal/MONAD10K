import pg from "pg";
import type { ReceiptStore } from "@sajalydv/grounded-sdk/server";

/**
 * Used receipts in Postgres, so a restart or a second instance cannot let a receipt buy twice.
 * `ON CONFLICT DO NOTHING` makes marking atomic: exactly one concurrent caller inserts the row.
 */
export async function postgresReceiptStore(connectionString: string): Promise<ReceiptStore> {
  const pool = new pg.Pool({ connectionString });
  await pool.query(
    "create table if not exists used_receipts (receipt_id numeric primary key, used_at timestamptz not null default now())",
  );
  return {
    async markUsed(receiptId) {
      const r = await pool.query("insert into used_receipts (receipt_id) values ($1) on conflict do nothing", [
        receiptId.toString(),
      ]);
      return r.rowCount === 1;
    },
  };
}
