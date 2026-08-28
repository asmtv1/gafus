/**
 * Explicit one-way NPD cutover. This command must be run only after the
 * approved live create/cancel smoke test; it deliberately does not bootstrap
 * credentials and does not perform an external NPD write.
 */
import { prisma } from "@gafus/prisma";

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing to set NPD cutover without --confirm");
  }
  const connection = await prisma.npdConnection.findUnique({ where: { id: "default" }, select: { fiscalizationStartedAt: true } });
  if (!connection) throw new Error("NPD connection is not bootstrapped");
  if (connection.fiscalizationStartedAt) {
    process.stdout.write(`NPD cutover already set: ${connection.fiscalizationStartedAt.toISOString()}\n`);
    return;
  }
  const now = new Date();
  const updated = await prisma.npdConnection.updateMany({
    where: { id: "default", fiscalizationStartedAt: null },
    data: { fiscalizationStartedAt: now },
  });
  if (updated.count !== 1) throw new Error("NPD cutover was changed concurrently");
  process.stdout.write(`NPD cutover set: ${now.toISOString()}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`NPD cutover failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
