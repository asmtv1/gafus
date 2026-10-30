import { defineConfig, mergeConfig } from "vitest/config";
import apiUnitConfig from "./vitest.config";

/** Explicitly isolated integration suite. Loading config does not connect to DB.
 * Each real-PG fixture still enforces its own database/role/schema preflight.
 */
const deny = (): never => { throw new Error("REALPG_ISOLATED_ENV_REQUIRED"); };
if (process.env.GAFUS_API_REALPG_ISOLATED !== "1") deny();
let target: URL;
try {
  target = new URL(process.env.DATABASE_URL ?? "");
} catch {
  deny();
}
if (!["postgresql:", "postgres:"].includes(target.protocol) ||
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    (!target.pathname.startsWith("/gafus_refactor_") &&
      !target.pathname.startsWith("/ag1_")) ||
    target.username.length === 0 || !target.password ||
    target.port === "5432" || !target.port ||
    (target.searchParams.has("sslmode") && target.searchParams.get("sslmode") !== "disable")) {
  deny();
}
const isolatedConfig = mergeConfig(apiUnitConfig, defineConfig({
  test: {
    include: [
      "src/**/*real-pg*.test.ts",
      "src/**/*realpg*.test.ts",
      "src/**/*real-prisma-pg*.test.ts",
      "src/**/*real-work*.test.ts",
    ],
    fileParallelism: false,
  },
}));
// Vite's mergeConfig concatenates arrays, including exclude. Explicitly clear
// default real-PG exclusion for this separately authorized and guarded suite.
if (isolatedConfig.test) isolatedConfig.test.exclude = [];
export default isolatedConfig;
