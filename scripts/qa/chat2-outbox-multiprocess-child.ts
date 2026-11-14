/** Disposable multi-process acceptance only. Never run against a shared PostgreSQL. */
import { prisma } from "@gafus/prisma";
import { processChat2OutboxOnce } from "../../packages/worker/src/chat2-outbox-worker";

async function main() {
  const raw = process.env.DATABASE_URL;
  const allowed = raw && new URL(raw).hostname === "127.0.0.1" &&
    new URL(raw).pathname === "/archqa_outbox_multiprocess" &&
    process.env.GAFUS_OUTBOX_MULTIPROCESS_ONLY === "1" &&
    process.env.NODE_ENV === "test" &&
    process.env.CHAT2_CENTRIFUGO_HTTP_API?.startsWith("http://127.0.0.1:");
  if (!allowed) throw new Error("OUTBOX_MULTIPROCESS_ISOLATION_DENIED");
  const location = await prisma.$queryRawUnsafe<Array<{ dir: string }>>(
    "SELECT current_setting('data_directory') AS dir");
  if (!location[0]?.dir.includes("/gafus-archqa-outbox-multiprocess.")) {
    throw new Error("OUTBOX_MULTIPROCESS_PG_DIRECTORY_DENIED");
  }
  const outcome = await processChat2OutboxOnce(1);
  process.stdout.write("CHILD_RESULT " + JSON.stringify(outcome) + "\n");
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(error => {
  process.stderr.write("CHILD_FAIL " + (error instanceof Error ? error.message : "UNKNOWN") + "\n");
  process.exit(1);
});