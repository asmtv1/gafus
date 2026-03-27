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
import { installGlobalJsErrorHandler, reportClientError } from "@/shared/lib/tracer";
import { ErrorBoundary, OfflineIndicator } from "@/shared/components";
import { useSyncProgressOnReconnect } from "@/shared/hooks/useSyncProgressOnReconnect";
import { SyncPreventionOnReconnect } from "@/shared/components/SyncPreventionOnReconnect";
import { COLORS } from "@/constants";

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
    // Скрываем splash screen только после загрузки шрифтов
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (!fontError) return;
    reportClientError(fontError instanceof Error ? fontError : new Error(String(fontError)), {
      issueKey: "FontLoad",
    });
  }, [fontError]);

  useEffect(() => {
    installGlobalJsErrorHandler();
  }, []);

  // DEBUG: лог любых deep link на Android для отладки VK redirect
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== "android") return;
    const sub = Linking.addEventListener("url", (e) => {
      console.log("[VK_LOGIN] Linking url event received", { url: e.url, urlLength: e.url?.length });
    });
    return () => sub.remove();
  }, []);

  // Не рендерим контент до загрузки шрифтов
  if (!fontsLoaded && !fontError) {
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
