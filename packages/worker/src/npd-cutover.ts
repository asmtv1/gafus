/**
 * Explicit one-way NPD cutover. This command must be run only after the
 * approved live create/cancel smoke test; it deliberately does not bootstrap
 * credentials and does not perform an external NPD write.
 */
import { applyNpdFiscalizationCutover } from "@gafus/core/services/appSubscription";
import { disconnectCoreDatabase } from "@gafus/core/services/systemHealth";

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing to set NPD cutover without --confirm");
  }
  const startedAt = await applyNpdFiscalizationCutover();
  process.stdout.write(`NPD fiscalization cutover: ${startedAt.toISOString()}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`NPD cutover failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}).finally(() => disconnectCoreDatabase());
