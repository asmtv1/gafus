import { Platform } from "react-native";

// API Configuration
// Production: https://api.gafus.ru (standalone API service)
// Expo Go on a real device: use the Mac LAN IP, not localhost, for example http://192.168.1.25:3001
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://api.gafus.ru";

// Cache durations (в миллисекундах)
export const CACHE_DURATIONS = {
  SHORT: 2 * 60 * 1000, // 2 минуты
  MEDIUM: 5 * 60 * 1000, // 5 минут
  LONG: 30 * 60 * 1000, // 30 минут
  DAY: 24 * 60 * 60 * 1000, // 24 часа
} as const;

// Сетевые таймауты (в миллисекундах)
export const NETWORK_TIMEOUTS = {
  request: 20_000,
} as const;

// UI таймауты (в миллисекундах)
export const UI_TIMEOUTS = {
  articleViewportGateFailsafe: 2200,
} as const;

// Цвета темы (соответствуют веб-версии)
export const COLORS = {
  // Основные цвета бренда (как в web)
  primary: "#4D5C2D", // оливковый - основной акцент
  primaryDark: "#3B4822",
  secondary: "#009dcf", // голубой - ссылки и акценты

  // Фоны
  background: "#E6E2D8", // основной фон страниц
  surface: "#ffffff", // белый - поверхности
  cardBackground: "#F5F0E5", // общий цвет подложки карточек, меню и форм во всём приложении

  // Текст
  text: "#352E2E", // тёмно-коричневый
  textSecondary: "#37373d",

  // Статусы
  error: "#dc3545",
  success: "#28a745",
  warning: "#ff9800",
  inProgress: "#009dcf",

  // UI элементы
  disabled: "#9e9e9e",
  placeholder: "#bdbdbd",
  border: "#4D5C2D", // оливковый - границы
  borderLight: "rgba(77, 92, 45, 0.2)",
  /** Текст и иконки на оливковом фоне (как на web) */
  onPrimary: "#ECE5D2",
} as const;

// Размеры экрана и отступы
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// Радиусы скругления
export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  round: 9999,
} as const;

// Типы курсов
export const COURSE_TYPES = {
  PERSONAL: "personal",
  GROUP: "group",
} as const;

// Статусы тренировок
export const TRAINING_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  PAUSED: "PAUSED",
} as const;

// Шрифты (соответствуют веб-версии)
export const FONTS = {
  // Основной шрифт - Montserrat
  // iOS использует PostScript names из встроенных font-файлов, Android/web — имена файлов.
  montserrat: Platform.OS === "ios" ? "Montserrat-Regular" : "Montserrat_400Regular",
  montserratBold: Platform.OS === "ios" ? "Montserrat-Bold" : "Montserrat_700Bold",
  montserratMedium: Platform.OS === "ios" ? "Montserrat-Medium" : "Montserrat_500Medium",

  // Кастомный шрифт - Moscow2024
  moscow2024: "Moscow2024",

  // Display-шрифт как на web (font-weight 400)
  impact: "Impact",
  sansFallback: "System", // Системный шрифт по умолчанию
} as const;
