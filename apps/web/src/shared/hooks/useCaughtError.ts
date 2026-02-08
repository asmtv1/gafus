"use client";

import { useCallback, useState } from "react";

/**
 * Хук для проброса асинхронных ошибок в Error Boundary.
 * Вызов catchError(err) в catch-блоке сохраняет ошибку в state;
 * при следующем рендере хук выполняет throw, и Error Boundary перехватывает ошибку.
 *
 * @returns [catchError, clearError] — стабильные ссылки (useCallback с []).
 */
export function useCaughtError(): [(err: unknown) => void, () => void] {
  const [error, setError] = useState<Error | null>(null);

  const catchError = useCallback((err: unknown) => {
    setError(err instanceof Error ? err : new Error(String(err)));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  if (error !== null) throw error;

  return [catchError, clearError];
}
