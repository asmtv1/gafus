// Agent 3's published-package compatibility tests live outside src so a clean
// Types declaration build never imports the package's not-yet-built dist root.
// This opt-in test runner does not change Agent 1's standard Vitest config.
export default {
  root: process.cwd(),
  test: {
    environment: "node",
    globals: true,
    include: ["tests/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
};
