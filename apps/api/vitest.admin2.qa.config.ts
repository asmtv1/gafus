/** ADMIN-2 isolated source-level contract: do not mutate shared package builds. */
import path from "node:path";
import { mergeConfig } from "vitest/config";
import sharedConfig from "./vitest.config";

export default mergeConfig(sharedConfig, {
  resolve: {
    alias: {
      "@gafus/core/services/adminGafus": path.resolve(
        __dirname,
        "../../packages/core/src/services/adminGafus/index.ts",
      ),
    },
  },
});
