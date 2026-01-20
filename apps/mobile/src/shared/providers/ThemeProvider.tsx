import { type ReactNode } from "react";
import { 
  MD3LightTheme, 
  MD3DarkTheme, 
  PaperProvider,
  adaptNavigationTheme,
} from "react-native-paper";
import { 
  DarkTheme as NavigationDarkTheme, 
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "@react-navigation/native";
import { useColorScheme } from "react-native";
import { COLORS } from "@/constants";

// Кастомная светлая тема
const customLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: COLORS.primary,
    primaryContainer: COLORS.primaryDark,
    secondary: COLORS.secondary,
    background: COLORS.background,
    surface: COLORS.surface,
    error: COLORS.error,
  },
};

// Кастомная тёмная тема
const customDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: COLORS.primary,
    primaryContainer: COLORS.primaryDark,
    secondary: COLORS.secondary,
  },
};

// Адаптация для React Navigation
const { LightTheme, DarkTheme } = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
});

// Объединение тем
const combinedLightTheme = {
  ...LightTheme,
  ...customLightTheme,
  colors: {
    ...LightTheme.colors,
    ...customLightTheme.colors,
  },
};

const combinedDarkTheme = {
  ...DarkTheme,
  ...customDarkTheme,
  colors: {
    ...DarkTheme.colors,
    ...customDarkTheme.colors,
  },
};

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Провайдер темы для React Native Paper и React Navigation
 * Автоматически определяет светлую/тёмную тему системы
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const theme = isDark ? combinedDarkTheme : combinedLightTheme;

  return (
    <PaperProvider theme={theme}>
      <NavigationThemeProvider value={theme}>
        {children}
      </NavigationThemeProvider>
    </PaperProvider>
  );
}
