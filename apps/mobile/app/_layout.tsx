import { initAnalyticsMobile } from "@gafus/analytics/mobile";
import Constants from "expo-constants";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Platform, StyleSheet, View } from "react-native";
import { useFonts } from "expo-font";
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";
import { AuthProvider, QueryProvider, ThemeProvider } from "@/shared/providers";
import { AnalyticsNavigationListener } from "@/shared/components/AnalyticsNavigationListener";
import { getOrCreateMobileAnalyticsId } from "@/shared/lib/analytics-id";
import { installGlobalJsErrorHandler, reportClientError } from "@/shared/lib/tracer";
import { ErrorBoundary, OfflineIndicator } from "@/shared/components";
import { useOtaAutoApply } from "@/shared/hooks/useOtaAutoApply";
import { useSyncProgressOnReconnect } from "@/shared/hooks/useSyncProgressOnReconnect";
import { SyncPreventionOnReconnect } from "@/shared/components/SyncPreventionOnReconnect";
import { useAuthStore } from "@/shared/stores";
import { COLORS } from "@/shared/config";

function SyncProgressOnReconnect() {
  useSyncProgressOnReconnect();
  return null;
}

// Не скрывать splash screen автоматически
SplashScreen.preventAutoHideAsync();

/**
 * Root Layout — точка входа в приложение
 * Настраивает провайдеры и базовую навигацию
 * Загружает шрифты: Montserrat (Google Fonts) и Moscow2024 (локальный)
 */
export default function RootLayout() {
  const authLoading = useAuthStore((s) => s.isLoading);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const [fontsLoaded, fontError] = useFonts({
    // Google Fonts - Montserrat
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_700Bold,
    // Display-шрифт как на web
    Impact: require("../assets/fonts/Impact.ttf"),
    // Локальный шрифт - Moscow2024
    Moscow2024: require("../assets/fonts/MOSCOW2024.otf"),
  });

  useEffect(() => {
    // Скрываем splash screen только когда готовы шрифты и завершена auth-проверка
    if ((fontsLoaded || fontError) && !authLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, authLoading]);

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

  useEffect(() => {
    if ((!fontsLoaded && !fontError) || authLoading) {
      return;
    }
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
  }, [fontsLoaded, fontError, authLoading]);

  // DEBUG: лог любых deep link на Android для отладки VK redirect
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== "android") return;
    const sub = Linking.addEventListener("url", (e) => {
      console.log("[VK_LOGIN] Linking url event received", { url: e.url, urlLength: e.url?.length });
    });
    return () => sub.remove();
  }, []);

  // Не рендерим контент до загрузки шрифтов
  if ((!fontsLoaded && !fontError) || authLoading) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryProvider>
            <ThemeProvider>
              <AuthProvider>
                <View style={styles.container}>
                  <AnalyticsNavigationListener />
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
