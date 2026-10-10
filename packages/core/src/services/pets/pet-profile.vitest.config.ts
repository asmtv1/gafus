import { fileURLToPath } from "node:url";
export default {
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  test: {
    environment: "node",
    testTimeout: 30_000,
    include: ["src/services/pets/petProfileVisibility.integration.test.ts", "src/utils/pet.test.ts", "src/validation/petSchema.test.ts"],
  },
  resolve: {
    alias: {
      "@gafus/types": fileURLToPath(new URL("../../../../types/src/index.ts", import.meta.url)),
    },
  },
};
