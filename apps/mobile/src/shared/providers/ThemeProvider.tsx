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
import { COLORS, FONTS } from "@/constants";

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
  fonts: {
    ...(MD3LightTheme.fonts ?? {}),
    default: {
      ...(MD3LightTheme.fonts?.default ?? {}),
      fontFamily: FONTS.montserrat,
    },
    bodyLarge: {
      ...(MD3LightTheme.fonts?.bodyLarge ?? {}),
      fontFamily: FONTS.montserrat,
    },
    bodyMedium: {
      ...(MD3LightTheme.fonts?.bodyMedium ?? {}),
      fontFamily: FONTS.montserrat,
    },
    bodySmall: {
      ...(MD3LightTheme.fonts?.bodySmall ?? {}),
      fontFamily: FONTS.montserrat,
    },
    headlineLarge: {
      ...(MD3LightTheme.fonts?.headlineLarge ?? {}),
      fontFamily: FONTS.montserrat,
    },
    headlineMedium: {
      ...(MD3LightTheme.fonts?.headlineMedium ?? {}),
      fontFamily: FONTS.montserrat,
    },
    headlineSmall: {
      ...(MD3LightTheme.fonts?.headlineSmall ?? {}),
      fontFamily: FONTS.montserrat,
    },
    titleLarge: {
      ...(MD3LightTheme.fonts?.titleLarge ?? {}),
      fontFamily: FONTS.montserrat,
    },
    titleMedium: {
      ...(MD3LightTheme.fonts?.titleMedium ?? {}),
      fontFamily: FONTS.montserrat,
    },
    titleSmall: {
      ...(MD3LightTheme.fonts?.titleSmall ?? {}),
      fontFamily: FONTS.montserrat,
    },
    labelLarge: {
      ...(MD3LightTheme.fonts?.labelLarge ?? {}),
      fontFamily: FONTS.montserrat,
    },
    labelMedium: {
      ...(MD3LightTheme.fonts?.labelMedium ?? {}),
      fontFamily: FONTS.montserrat,
    },
    labelSmall: {
      ...(MD3LightTheme.fonts?.labelSmall ?? {}),
      fontFamily: FONTS.montserrat,
    },
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
  fonts: {
    ...(MD3DarkTheme.fonts ?? {}),
    default: {
      ...(MD3DarkTheme.fonts?.default ?? {}),
      fontFamily: FONTS.montserrat,
    },
    bodyLarge: {
      ...(MD3DarkTheme.fonts?.bodyLarge ?? {}),
      fontFamily: FONTS.montserrat,
    },
    bodyMedium: {
      ...(MD3DarkTheme.fonts?.bodyMedium ?? {}),
      fontFamily: FONTS.montserrat,
    },
    bodySmall: {
      ...(MD3DarkTheme.fonts?.bodySmall ?? {}),
      fontFamily: FONTS.montserrat,
    },
    headlineLarge: {
      ...(MD3DarkTheme.fonts?.headlineLarge ?? {}),
      fontFamily: FONTS.montserrat,
    },
    headlineMedium: {
      ...(MD3DarkTheme.fonts?.headlineMedium ?? {}),
      fontFamily: FONTS.montserrat,
    },
    headlineSmall: {
      ...(MD3DarkTheme.fonts?.headlineSmall ?? {}),
      fontFamily: FONTS.montserrat,
    },
    titleLarge: {
      ...(MD3DarkTheme.fonts?.titleLarge ?? {}),
      fontFamily: FONTS.montserrat,
    },
    titleMedium: {
      ...(MD3DarkTheme.fonts?.titleMedium ?? {}),
      fontFamily: FONTS.montserrat,
    },
    titleSmall: {
      ...(MD3DarkTheme.fonts?.titleSmall ?? {}),
      fontFamily: FONTS.montserrat,
    },
    labelLarge: {
      ...(MD3DarkTheme.fonts?.labelLarge ?? {}),
      fontFamily: FONTS.montserrat,
    },
    labelMedium: {
      ...(MD3DarkTheme.fonts?.labelMedium ?? {}),
      fontFamily: FONTS.montserrat,
    },
    labelSmall: {
      ...(MD3DarkTheme.fonts?.labelSmall ?? {}),
      fontFamily: FONTS.montserrat,
    },
  },
};

// Адаптация для React Navigation
const { LightTheme, DarkTheme } = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
});

// Объединение тем для React Navigation (без fonts, так как Navigation не поддерживает)
const navigationLightTheme = {
  ...LightTheme,
  colors: {
    ...LightTheme.colors,
    ...customLightTheme.colors,
  },
};

const navigationDarkTheme = {
  ...DarkTheme,
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
 * Использует Montserrat как основной шрифт (соответствует веб-версии)
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // Для React Native Paper используем тему с fonts
  const paperTheme = isDark ? customDarkTheme : customLightTheme;
  // Для React Navigation используем тему без fonts
  const navigationTheme = isDark ? navigationDarkTheme : navigationLightTheme;

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </PaperProvider>
  );
}
