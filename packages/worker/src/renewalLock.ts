import { Client } from "pg";

/** A session lock needs a dedicated physical connection, never a pooled Prisma query. */
export async function acquireRenewalLock(key: number) {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  let healthy = true;
  client.on("error", () => { healthy = false; });
  try {
    await client.connect();
    const result = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [key]);
    if (!result.rows[0]?.locked) { await client.end(); return null; }
    return {
      async assertHeld() {
        if (!healthy) throw new Error("Renewal lock connection lost");
        await client.query("SELECT 1");
      },
      async release() {
        try { if (healthy) await client.query("SELECT pg_advisory_unlock($1)", [key]); }
        finally { await client.end(); }
      },
    };
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}
