// Типы для CSRF Store

export interface CSRFState {
  token: string | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  retryCount: number;

  // Действия
  fetchToken: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  resetRetryCount: () => void;

  // Утилиты
  isTokenValid: () => boolean;
  getTokenAge: () => number | null;
  shouldRefreshToken: () => boolean;
}
