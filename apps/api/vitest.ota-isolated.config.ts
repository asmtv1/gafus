import { defineConfig, mergeConfig } from "vitest/config";
import unitConfig from "./vitest.config";
/** Test-only PostgreSQL instance created by initdb in /tmp, loopback-only. */
const allowed = /^postgresql:\/\/asmtv1@127\.0\.0\.1:55673\/gafus_ota_preview_qa(?:\?schema=public)?$/;
if (process.env.GAFUS_OTA_TEST_ISOLATED !== "1" ||
    !allowed.test(process.env.DATABASE_URL ?? "") ||
    process.env.GAFUS_OTA_TEST_PG_URL !== process.env.DATABASE_URL) {
  throw new Error("OTA_ISOLATED_LOCAL_DATABASE_REQUIRED");
}
const config = mergeConfig(unitConfig, defineConfig({
  test: {
    include: ["src/modules/mobile-ota/deployment-commands.realpg.test.ts"],
    fileParallelism: false,
  },
}));
if (config.test) config.test.exclude = [];
export default config;
