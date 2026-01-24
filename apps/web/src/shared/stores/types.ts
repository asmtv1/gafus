// Store типы для apps/web (с методами)

import type {
  UserStateData,
  CourseStateData,
  TrainingStateData,
  PetsStateData,
  NotificationStateData,
  CourseWithProgressData,
  UserProfile,
  UpdateUserProfileInput,
  UserPreferences,
  CreatePetInput,
  UpdatePetInput,
  Pet,
} from "@gafus/types";

// User Store с методами
export interface UserStore extends UserStateData {
  // Действия
  setUser: (user: UserStateData["user"]) => void;
  setProfile: (profile: UserProfile | null) => void;
  setPreferences: (preferences: Partial<UserPreferences>) => void;

  // Загрузка данных
  fetchProfile: () => Promise<void>;
  fetchPreferences: () => Promise<void>;

  // Обновление данных
  updateProfile: (data: UpdateUserProfileInput) => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;

  // Очистка
  clearUser: () => void;
  clearError: () => void;
  clearProfileError: () => void;
  clearPreferencesError: () => void;

  // Утилиты
  isProfileLoaded: () => boolean;
  isPreferencesLoaded: () => boolean;
  hasProfile: () => boolean;
  getUserDisplayName: () => string;
}

// Course Store с методами
export interface CourseStore extends CourseStateData {
  // Действия для курсов
  setAllCourses: (courses: CourseWithProgressData[], type?: string) => void;
  setFavorites: (courses: CourseWithProgressData[]) => void;
  setAuthored: (courses: CourseWithProgressData[]) => void;

  // Действия для избранного
  addToFavorites: (courseId: string) => void;
  removeFromFavorites: (courseId: string) => void;
  isFavorite: (courseId: string) => boolean;
  setFavoriteCourseIds: (courseIds: string[]) => void;

  // Действия для загрузки
  setLoading: (key: "all" | "favorites" | "authored", loading: boolean) => void;
  setError: (key: "all" | "favorites" | "authored", error: string | null) => void;

  // Действия для изображений
  markImageLoaded: (url: string) => void;
  markImageError: (url: string) => void;
  isImageCached: (url: string) => boolean;

  // Действия для статистики
  setCourseStats: (stats: CourseStateData["courseStats"]) => void;
  getCourseStats: () => CourseStateData["courseStats"];

  // Действия для предзагрузки
  markPrefetched: (courseId: string) => void;
  isPrefetched: (courseId: string) => boolean;

  // SWR интеграция
  syncWithSWR: (key: "all" | "favorites" | "authored", data: CourseWithProgressData[]) => void;
  invalidateCache: (key: "all" | "favorites" | "authored") => void;
  invalidateFavoritesCache: () => void;

  // Утилиты
  isStale: (cache: CourseStateData["allCourses"], maxAge?: number) => boolean;
  getCourseById: (courseId: string) => CourseWithProgressData | null;
  getPopularCourses: (limit?: number) => CourseWithProgressData[];
  clearCache: () => void;
}

// Training Store с методами
export interface TrainingStore extends TrainingStateData {
  // Утилиты
  getStepKey: (courseId: string, dayOnCourseId: string, stepIndex: number) => string;
  getDayKey: (courseId: string, dayOnCourseId: string) => string;

  // Геттеры
  getOpenIndex: (courseId: string, dayOnCourseId: string) => number | null;
  getRunningIndex: (courseId: string, dayOnCourseId: string) => number | null;
  getCourseAssigned: (courseId: string) => boolean;
  getAssignError: (courseId: string) => string | null;

  // Кэширование дней тренировок
  getCachedTrainingDays: (courseType: string) => {
    data: TrainingStateData["cachedTrainingDays"][string]["data"] | null;
    isExpired: boolean;
  };
  setCachedTrainingDays: (
    courseType: string,
    data: TrainingStateData["cachedTrainingDays"][string]["data"],
  ) => void;
  clearCachedTrainingDays: (courseType?: string) => void;

  // Действия для дня
  setOpenIndex: (courseId: string, dayOnCourseId: string, index: number | null) => void;
  setRunningIndex: (courseId: string, dayOnCourseId: string, index: number | null) => void;
  setCourseAssigned: (courseId: string, assigned: boolean) => void;
  setAssignError: (courseId: string, error: string | null) => void;

  // Поиск активного шага
  findRunningStepIndex: (
    courseId: string,
    dayOnCourseId: string,
    totalSteps: number,
  ) => number | null;

  // Серверные действия
  togglePauseWithServer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
  ) => Promise<void>;
  resumeNotificationWithServer: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
  ) => Promise<void>;
}

// Pets Store с методами
export interface PetsStore extends PetsStateData {
  // Сеттеры
  setPets: (pets: Pet[]) => void;
  setActivePetId: (petId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Действия
  fetchPets: () => Promise<void>;
  createPet: (data: CreatePetInput) => Promise<Pet>;
  updatePet: (data: UpdatePetInput) => Promise<Pet>;
  deletePet: (petId: string) => Promise<void>;

  // Геттеры
  getActivePet: () => Pet | null;
  getPetById: (petId: string) => Pet | null;
  hasPets: () => boolean;
  getPetsCount: () => number;
}

// Notification Store с методами
export interface NotificationStore extends NotificationStateData {
  // Действия
  initializePermission: () => void;
  requestPermission: (vapidPublicKey?: string) => Promise<void>;
  dismissModal: () => void;
  setShowModal: (show: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  // Подписка на push-уведомления
  setupPushSubscription: (vapidPublicKey: string) => Promise<void>;
  checkServerSubscription: () => Promise<void>;
  removePushSubscription: () => Promise<void>;

  // Утилиты
  isSupported: () => boolean;
  canRequest: () => boolean;
  isGranted: () => boolean;

  // Автовосстановление серверной подписки при наличии разрешения
  ensureActiveSubscription: () => Promise<void>;

  // Управление пользовательским запретом авто-переподписки
  setDisabledByUser: (disabled: boolean) => void;

  // Установка userId
  setUserId: (userId: string) => void;

  // Автоматическое обновление push-подписки
  updateSubscriptionAction: (subscription: {
    id: string;
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    keys: { p256dh: string; auth: string };
  }) => Promise<{ success: boolean }>;
}
