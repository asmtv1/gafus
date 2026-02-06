import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, View } from "react-native";
import { useFonts } from "expo-font";
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";

import { QueryProvider, AuthProvider, ThemeProvider } from "@/shared/providers";
import { ErrorBoundary, OfflineIndicator } from "@/shared/components";
import { useSyncProgressOnReconnect } from "@/shared/hooks/useSyncProgressOnReconnect";
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
    // Локальный шрифт - Moscow2024
    Moscow2024: require("../assets/fonts/MOSCOW2024.otf"),
  });

  useEffect(() => {
    // Скрываем splash screen только после загрузки шрифтов
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Не рендерим контент до загрузки шрифтов
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <ErrorBoundary>
        <QueryProvider>
          <ThemeProvider>
            <AuthProvider>
              <View style={styles.container}>
                <OfflineIndicator />
                <SyncProgressOnReconnect />
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
