export const API_ROUTES = {
  AUTH: {
    LOGIN: "/api/auth/login",
    REGISTER: "/api/auth/register",
    LOGOUT: "/api/auth/logout",
    SESSION: "/api/auth/session",
  },
  COURSES: {
    LIST: "/api/courses",
    DETAIL: (id: string) => `/api/courses/${id}`,
  },
  TRAININGS: {
    LIST: "/api/trainings",
    CREATE: "/api/trainings",
    UPDATE: (id: string) => `/api/trainings/${id}`,
    DETAIL_BY_DAY: (courseType: string, day: string) => `/api/trainings/${courseType}/${day}`,
  },
};

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  COURSES: "/courses",
  TRAININGS: "/trainings",
  TRAINING_DETAIL: (type: string) => `/trainings/${type}`,
  TRAINING_DAY: (courseType: string, day: string) => `/trainings/${courseType}/${day}`,
  PROFILE: "/profile",
};

export const DEFAULT_PAGE_SIZE = 10;

export const TRAINING_STATUSES = {
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
