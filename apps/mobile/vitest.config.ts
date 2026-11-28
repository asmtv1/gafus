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
      // Node tests do not run Expo native modules or Metro Flow transforms.
      "expo-crypto": path.resolve(__dirname, "test/expo-crypto.ts"),
      "@react-native-community/netinfo": path.resolve(__dirname, "test/netinfo.ts"),
      "expo-application": path.resolve(__dirname, "test/expo-application.ts"),
      "expo-device": path.resolve(__dirname, "test/expo-device.ts"),
      "expo-updates": path.resolve(__dirname, "test/expo-updates.ts"),
      "expo-constants": path.resolve(__dirname, "test/expo-constants.ts"),
      // Vitest/Rolldown cannot parse Expo 55 published .js containing JSX.
      // Use the existing test-only presentation shim; native Metro is unchanged.
      "expo-linear-gradient": path.resolve(__dirname, "src/shared/lib/utils/g1-gradientMock.ts"),
    },
  },
});
