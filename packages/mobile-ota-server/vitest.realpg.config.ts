import { defineConfig } from "vitest/config";
const actual = process.env.DATABASE_URL ?? "";
const exact = /^postgresql:\/\/asmtv1@127\.0\.0\.1:55673\/gafus_ota_preview_qa\?schema=public$/;
if (process.env.GAFUS_OTA_TEST_ISOLATED !== "1" ||
    process.env.GAFUS_OTA_TEST_PG_URL !== actual || !exact.test(actual)) {
  throw new Error("OTA_ISOLATED_QA_DATABASE_REQUIRED");
}
export default defineConfig({
  test: { environment: "node", fileParallelism: false, include: ["tests/**/*.realpg.test.ts"] },
});
