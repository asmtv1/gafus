import { ChatPushNavigation } from "@/shared/components/ChatPushNavigation";
import { initAnalyticsMobile } from "@gafus/analytics/mobile";
import Constants from "expo-constants";
import { useCallback, useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from "expo-screen-orientation";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NativeModules, Platform, StyleSheet, View } from "react-native";
import { AuthProvider, QueryProvider, ThemeProvider } from "@/shared/providers";
import { AnalyticsNavigationListener } from "@/shared/components/AnalyticsNavigationListener";
import { getOrCreateMobileAnalyticsId } from "@/shared/lib/analytics-id";
import {
  installGlobalJsErrorHandler,
  reportClientError,
} from "@/shared/lib/error-reporting";
import { ErrorBoundary, OfflineIndicator, RequiredAppUpdateGate } from "@/shared/components";
import { QaRuntimeIdentity } from "@/shared/components/QaRuntimeIdentity";
import { RequiredOtaUpdateGate } from "@/shared/components/RequiredOtaUpdateGate";
import { useRoleAwareScreenCapture } from "@/shared/hooks/useRoleAwareScreenCapture";
import { useOfflineJournalReplay } from "@/shared/hooks/useOfflineJournalReplay";
import { useAuthStore } from "@/shared/stores";
import { COLORS } from "@/shared/config";
import { useAppFonts } from "@/shared/hooks/useAppFonts";
import { WalkWidgetSessionSync } from "@/features/walk/WalkWidgetSessionSync";

import { startMobileTelemetryUploadWorker } from "@/shared/lib/telemetry/mobileTelemetryClient";
import { startNativeCrashCapture } from "@/shared/lib/telemetry/nativeCrashCapture";

// Expo Observe native lifecycle recorder is active before JS; configure its
// GAFUS-only dispatch path before installing our separate JS error handler.
startNativeCrashCapture();
installGlobalJsErrorHandler();

function SyncOfflineJournal() {
  useOfflineJournalReplay();
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

/** Optional SDK work must not compete with initial auth or mandatory OTA.
 * Mount only after both update gates have opened. */
function DeferredRewardedAdsWarmup() {
  const isLoading = useAuthStore(s => s.isLoading);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        if (cancelled) return;
        void import("@/features/rewarded-ads/adapter/yandexRewardedAds").then(
          ({ warmUpYandexMobileAds }) => cancelled ? undefined : warmUpYandexMobileAds(),
        ).catch(() => undefined);
      }, 0);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [isLoading, isAuthenticated]);
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
  useEffect(() => startMobileTelemetryUploadWorker(), []);

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
  const [appContentLaidOut, setAppContentLaidOut] = useState(false);
  const onContentLayout = useCallback(() => setAppContentLaidOut(true), []);

  // As in 1.6.9, the native Expo splash remains in place during bootstrap.
  // Wait for actual React layout to avoid showing an empty frame on Android.
  useEffect(() => {
    if (!appContentLaidOut || authLoading || (!fontsReady && !fontError)) return;
    const frame = requestAnimationFrame(() => {
      void SplashScreen.hideAsync()
        .catch((error) => {
          reportClientError(error instanceof Error ? error : new Error(String(error)), {
            issueKey: "SplashScreen",
            keys: { operation: "hide_after_initial_layout" },
          });
        })
        .finally(() => {
          // Android's static native poster is independent of the JS bundle.
          // Release it only after auth, fonts and initial route layout are ready.
          if (Platform.OS === "android") {
            NativeModules.GafusStartupPoster?.hide();
          }
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [appContentLaidOut, authLoading, fontsReady, fontError]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!fontError) return;
    reportClientError(fontError instanceof Error ? fontError : new Error(String(fontError)), {
      issueKey: "FontLoad",
    });
  }, [fontError]);

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
                        <DeferredRewardedAdsWarmup />
                        <OfflineIndicator />
                        <SyncOfflineJournal />
                        <Stack screenOptions={{ headerShown: false }}>
                          <Stack.Screen name="(auth)" />
                          <Stack.Screen name="(main)" />
                        </Stack>
                        <QaRuntimeIdentity />
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
