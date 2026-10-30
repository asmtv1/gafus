import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../../vitest.config";

// Isolated AG3 mock-only ReactDOM screen test. Do not alter app build configuration.
export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: {
        "expo-linear-gradient": fileURLToPath(new URL("./g1-gradientMock.ts", import.meta.url)),
      },
    },
  }),
);
