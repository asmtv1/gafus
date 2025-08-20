// Типы для SWR хуков

export interface SWRConfig {
  refreshInterval?: number;
  revalidateOnFocus?: boolean;
  revalidateOnReconnect?: boolean;
}

export interface SWRResponse<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: (data?: T, options?: { revalidate?: boolean }) => Promise<T | undefined>;
}

export interface SWROptions extends SWRConfig {
  onSuccess?: <T>(data: T) => void;
  onError?: (error: Error) => void;
}
