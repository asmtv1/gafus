import { defineConfig } from "vitest/config";
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node", globals: true,
    include: ["src/trainer-vite/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
    testTimeout: 30_000,
  },
});
