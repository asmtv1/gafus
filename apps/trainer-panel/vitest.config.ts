import { defineConfig } from "vitest/config";
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node", globals: true,
    // Node 24 ships navigator as a getter-only global. The existing JSDOM
    // mounted suites replace it with their isolated window.navigator.
    setupFiles: ["./test/node24-navigator.setup.ts"],
    include: ["src/trainer-vite/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
    testTimeout: 30_000,
  },
});
