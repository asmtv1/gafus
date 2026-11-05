import { ChatPushNavigation } from "@/shared/components/ChatPushNavigation";
import { initAnalyticsMobile } from "@gafus/analytics/mobile";
import Constants from "expo-constants";
import { useCallback, useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from "expo-screen-orientation";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Platform, StyleSheet, View } from "react-native";
import { AuthProvider, QueryProvider, ThemeProvider } from "@/shared/providers";
import { AnalyticsNavigationListener } from "@/shared/components/AnalyticsNavigationListener";
import { getOrCreateMobileAnalyticsId } from "@/shared/lib/analytics-id";
import {
  initializeMobileJsTracer,
  installGlobalJsErrorHandler,
  reportClientError,
  setTracerNetworkContext,
  setTracerUser,
} from "@/shared/lib/tracer";
import { ErrorBoundary, OfflineIndicator, RequiredAppUpdateGate } from "@/shared/components";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import { RequiredOtaUpdateGate } from "@/shared/components/RequiredOtaUpdateGate";
import { useRoleAwareScreenCapture } from "@/shared/hooks/useRoleAwareScreenCapture";
import { useSyncProgressOnReconnect } from "@/shared/hooks/useSyncProgressOnReconnect";
import { SyncPreventionOnReconnect } from "@/shared/components/SyncPreventionOnReconnect";
import { useAuthStore } from "@/shared/stores";
import { COLORS } from "@/shared/config";
import { useAppFonts } from "@/shared/hooks/useAppFonts";
import { warmUpYandexMobileAds } from "@/features/rewarded-ads";
import { StartupLoader } from "@/shared/components/StartupLoader";
import { WalkWidgetSessionSync } from "@/features/walk/WalkWidgetSessionSync";

// Initialize before React mounts so startup and provider errors are captured.
initializeMobileJsTracer();
installGlobalJsErrorHandler();

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

function TracerRuntimeContext() {
  const userId = useAuthStore((state) => state.user?.id);
  const { connectionType, isConnected, isInternetReachable, isOffline } = useNetworkStatus();

  useEffect(() => {
    setTracerUser(userId);
  }, [userId]);

  useEffect(() => {
    setTracerNetworkContext({
      connectionType,
      isConnected,
      isInternetReachable,
      isOffline,
    });
  }, [connectionType, isConnected, isInternetReachable, isOffline]);

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
  useRoleAwareScreenCapture();

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
  const authLoading = useAuthStore((s) => s.isLoading);
  const [startupVisible, setStartupVisible] = useState(true);
  const [startupImageReady, setStartupImageReady] = useState(false);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);
  const [appContentLaidOut, setAppContentLaidOut] = useState(false);
  const onStartupReady = useCallback(() => setStartupImageReady(true), []);
  const onContentLayout = useCallback(() => setAppContentLaidOut(true), []);

  useEffect(() => {
    if (!startupImageReady) return;
    let cancelled = false;
    let secondFrame = 0;
    // Android's launch screen must not be hidden before the poster has
    // actually been composed. One onLoad callback alone is too early.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        void SplashScreen.hideAsync()
          .then(() => { if (!cancelled) setNativeSplashHidden(true); })
          .catch(error => {
            if (!cancelled) {
              reportClientError(error, { issueKey: "SplashScreen",
                keys: { operation: "hide_after_poster_paint" } });
              // An interrupted native splash must not permanently block UI.
              setNativeSplashHidden(true);
            }
          });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [startupImageReady]);

  useEffect(() => {
    if (!nativeSplashHidden || !appContentLaidOut || authLoading ||
        (!fontsReady && !fontError)) return;
    // Allow the initial route to paint behind the poster before removing it.
    const frame = requestAnimationFrame(() => setStartupVisible(false));
    return () => cancelAnimationFrame(frame);
  }, [nativeSplashHidden, appContentLaidOut, authLoading, fontsReady, fontError]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // iOS can initialize automatically when the first ad is loaded, but doing
    // it during bootstrap keeps the first rewarded-ad request off the UI path.
    void warmUpYandexMobileAds().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!fontError) return;
    reportClientError(fontError instanceof Error ? fontError : new Error(String(fontError)), {
      issueKey: "FontLoad",
    });
  }, [fontError]);

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

  // Keep exactly ONE poster mounted across font/auth initialization and the
  // first route paint. Swapping the whole root from a standalone splash view
  // into the navigator caused a blank/black frame on Android.
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        {(fontsReady || fontError) && (
          <View style={styles.container} onLayout={onContentLayout}>
          <ErrorBoundary>
            <QueryProvider>
              <ThemeProvider>
                <RequiredAppUpdateGate>
                  <RequiredOtaUpdateGate>
                    <AuthProvider>
                      <View style={styles.container}>
                        <WalkWidgetSessionSync />
                        <AnalyticsNavigationListener />
                        <ChatPushNavigation />
                        <AnalyticsBootstrap />
                        <TracerRuntimeContext />
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
                  </RequiredOtaUpdateGate>
                </RequiredAppUpdateGate>
              </ThemeProvider>
            </QueryProvider>
          </ErrorBoundary>
          </View>
        )}
        {startupVisible && <StartupLoader overlay onReady={onStartupReady} />}
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
