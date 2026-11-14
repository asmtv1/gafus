import { defineConfig } from "vitest/config";
export default defineConfig({test:{include:["tests/rollout-policy.test.ts"],environment:"node",fileParallelism:false}});
