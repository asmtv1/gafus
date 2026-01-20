import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, View } from "react-native";

import { QueryProvider, AuthProvider, ThemeProvider } from "@/shared/providers";
import { ErrorBoundary, OfflineIndicator } from "@/shared/components";

// Не скрывать splash screen автоматически
SplashScreen.preventAutoHideAsync();

/**
 * Root Layout — точка входа в приложение
 * Настраивает провайдеры и базовую навигацию
 */
export default function RootLayout() {
  useEffect(() => {
    // Скрываем splash screen после инициализации
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <ErrorBoundary>
        <QueryProvider>
          <ThemeProvider>
            <AuthProvider>
              <View style={styles.container}>
                <OfflineIndicator />
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
  },
});
