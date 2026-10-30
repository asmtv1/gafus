import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/server-integration/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "react-native": path.resolve(__dirname, "test/react-native.ts"),
      // Vitest/Rolldown cannot parse Expo 55 published .js containing JSX.
      // Use the existing test-only presentation shim; native Metro is unchanged.
      "expo-linear-gradient": path.resolve(__dirname, "src/shared/lib/utils/g1-gradientMock.ts"),
    },
  },
});
