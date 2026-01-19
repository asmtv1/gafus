/**
 * Web-специфичные утилиты
 * Все эти утилиты используют Browser APIs и не могут быть переиспользованы в React Native
 */

// Browser UI утилиты
export * from "./confetti";
export * from "./hapticFeedback";
export * from "./sweetAlert";

// Browser API утилиты
export * from "./detectPushSupport";
export * from "./eventListeners";
export * from "./imageLoading";

// Кеш и offline утилиты
export * from "./cacheManager";
export * from "./clearProfileCache";
export * from "./offlineCacheUtils";
export * from "./serviceWorkerManager";

// Фильтры и сортировка
export * from "./courseFilters";

// MUI динамические импорты (оптимизация bundle)
export * from "./muiImports";

// Server-side утилиты
export * from "./getCurrentUserId";
