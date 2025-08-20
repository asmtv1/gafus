// Auth
export * from "./auth";

// Components
export * from "./components";

// Data
export * from "./data";

// Stores (исключаем дублирующиеся типы)
export * from "./stores/csrf";
export * from "./stores/notification";
export type { CreatePetInput, PetAward, PetsState } from "./stores/petsStore";
export * from "./stores/step";
export * from "./stores/timer";
export * from "./stores/training";
export {
  CACHE_DURATION,
  DEFAULT_USER_PREFERENCES,
  PREFERENCES_CACHE_DURATION,
} from "./stores/userStore";
export type { UserPreferences, UserState } from "./stores/userStore";

// Utils
export * from "./utils";

// Pages
export * from "./pages";

// Error Handling
export * from "./error-handling";

// Offline
export * from "./offline";

// Error Reporting
export * from "./error-reporting";

// SWR
export * from "./swr";

// Собственные типы (заменяют зависимости от фреймворков)
export * from "./types";
