import { fileURLToPath } from "node:url";
// Dedicated domain tests. The integration suite skips unless its explicit safe URL is supplied.
export default {
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["src/services/gallery/**/*.test.ts", "src/services/user/deleteUserAccount.test.ts"],
  },
  resolve: {
    alias: {
      "@gafus/types": fileURLToPath(new URL("../../../../types/src/index.ts", import.meta.url)),
    },
  },
};
