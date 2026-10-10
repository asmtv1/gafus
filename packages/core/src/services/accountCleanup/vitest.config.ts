import { fileURLToPath } from "node:url";
export default {
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  test: {
    environment: "node",
    testTimeout: 30_000,
    include: ["src/services/accountCleanup/accountCleanup.integration.test.ts"],
  },
};
