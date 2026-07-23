import { initAnalyticsMobile } from "@gafus/analytics/mobile";
import Constants from "expo-constants";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { usePreventScreenCapture } from "expo-screen-capture";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from "expo-screen-orientation";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Platform, StyleSheet, View } from "react-native";
import { AuthProvider, QueryProvider, ThemeProvider } from "@/shared/providers";
import { AnalyticsNavigationListener } from "@/shared/components/AnalyticsNavigationListener";
import { getOrCreateMobileAnalyticsId } from "@/shared/lib/analytics-id";
import { installGlobalJsErrorHandler, reportClientError } from "@/shared/lib/tracer";
import { ErrorBoundary, OfflineIndicator, RequiredAppUpdateGate } from "@/shared/components";
import { useOtaAutoApply } from "@/shared/hooks/useOtaAutoApply";
import { useSyncProgressOnReconnect } from "@/shared/hooks/useSyncProgressOnReconnect";
import { SyncPreventionOnReconnect } from "@/shared/components/SyncPreventionOnReconnect";
import { useAuthStore } from "@/shared/stores";
import { COLORS } from "@/shared/config";
import { useAppFonts } from "@/shared/hooks/useAppFonts";

function SyncProgressOnReconnect() {
  useSyncProgressOnReconnect();
  return null;
}

function AnalyticsBootstrap() {
  const authLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    if (authLoading) return;

    const extra = Constants.expoConfig?.extra as
      | { ymMobileApiKey?: string; ymMobileEnabled?: boolean; analyticsDebug?: boolean }
      | undefined;
    void (async () => {
      const anon = await getOrCreateMobileAnalyticsId();
      await initAnalyticsMobile({
        apiKey: extra?.ymMobileApiKey ?? "",
        devAllowCapture: extra?.ymMobileEnabled === true,
        anonymousId: anon,
        debugEnabled: extra?.analyticsDebug === true,
      });
    })();
  }, [authLoading]);

  return null;
}

// Не скрывать splash screen автоматически
SplashScreen.preventAutoHideAsync();

/**
 * Root Layout — точка входа в приложение
 * Настраивает провайдеры и базовую навигацию
 * Использует встроенные в native build шрифты; web загружает их асинхронно.
 */
export default function RootLayout() {
  usePreventScreenCapture("gafus-global-screen-protection");

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
      (error) => {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          severity: "warning",
          issueKey: "ScreenOrientation",
          keys: { operation: "lock_app_portrait" },
        });
      },
    );
  }, []);

  const checkAuth = useAuthStore((s) => s.checkAuth);
  const { fontsReady, fontError } = useAppFonts();

  useEffect(() => {
    if (fontsReady || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady, fontError]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!fontError) return;
    reportClientError(fontError instanceof Error ? fontError : new Error(String(fontError)), {
      issueKey: "FontLoad",
    });
  }, [fontError]);

  useEffect(() => {
    installGlobalJsErrorHandler();
  }, []);

  useOtaAutoApply();

  // DEBUG: лог любых deep link на Android для отладки VK redirect
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== "android") return;
    const sub = Linking.addEventListener("url", (e) => {
      console.log("[VK_LOGIN] Linking url event received", {
        url: e.url,
        urlLength: e.url?.length,
      });
    });
    return () => sub.remove();
  }, []);

  // Native fonts are embedded at build time; this gate only matters on web.
  if (!fontsReady && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryProvider>
            <ThemeProvider>
              <RequiredAppUpdateGate>
                <AuthProvider>
                  <View style={styles.container}>
                    <AnalyticsNavigationListener />
                    <AnalyticsBootstrap />
                    <OfflineIndicator />
                    <SyncProgressOnReconnect />
                    <SyncPreventionOnReconnect />
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="(main)" />
                    </Stack>
                  </View>
                  <StatusBar style="auto" />
                </AuthProvider>
              </RequiredAppUpdateGate>
            </ThemeProvider>
          </QueryProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
