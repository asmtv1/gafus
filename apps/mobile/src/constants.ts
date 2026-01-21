// API Configuration
// Production: https://api.gafus.ru (standalone API service)
// Development: http://api.gafus.localhost (через nginx) или http://localhost:3001 (прямо)
export const API_BASE_URL = __DEV__ 
  ? "http://localhost:3001"  // Для разработки используйте прямое подключение или http://api.gafus.localhost через nginx
  : "https://api.gafus.ru";  // Production API

// Cache durations (в миллисекундах)
export const CACHE_DURATIONS = {
  SHORT: 2 * 60 * 1000, // 2 минуты
  MEDIUM: 5 * 60 * 1000, // 5 минут
  LONG: 30 * 60 * 1000, // 30 минут
  DAY: 24 * 60 * 60 * 1000, // 24 часа
} as const;

// Цвета темы (соответствуют веб-версии)
export const COLORS = {
  // Основные цвета бренда (как в web)
  primary: "#636128", // оливковый - основной акцент
  primaryDark: "#4a4a1e",
  secondary: "#009dcf", // голубой - ссылки и акценты
  
  // Фоны
  background: "#DAD3C1", // основной фон страниц
  surface: "#ffffff", // белый - поверхности
  cardBackground: "#FFF8E5", // кремовый фон карточек
  
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
  border: "#636128", // оливковый - границы
  borderLight: "rgba(99, 97, 40, 0.2)",
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
  montserrat: "Montserrat_400Regular",
  montserratBold: "Montserrat_700Bold",
  montserratMedium: "Montserrat_500Medium",
  
  // Кастомный шрифт - Moscow2024
  moscow2024: "Moscow2024",
  
  // Системные fallback
  impact: "Impact", // iOS/Android системный
  sansFallback: "System", // Системный шрифт по умолчанию
} as const;
