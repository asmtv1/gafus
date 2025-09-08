/**
 * Утилиты для ретраев с экспоненциальной задержкой
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Выполняет функцию с ретраями и экспоненциальной задержкой
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    onRetry
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        console.error(`❌ Все ${maxRetries} попыток исчерпаны:`, lastError);
        throw lastError;
      }

      // Вычисляем задержку с экспоненциальным ростом
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      
      console.warn(`⚠️ Попытка ${attempt}/${maxRetries} не удалась, повтор через ${delay}ms:`, error);
      
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Ждем перед следующей попыткой
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Специализированная функция для серверных действий
 */
export async function retryServerAction<T>(
  action: () => Promise<T>,
  actionName: string,
  options: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(action, {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    onRetry: (attempt, error) => {
      console.warn(`🔄 ${actionName}: попытка ${attempt} не удалась:`, error.message);
    },
    ...options
  });
}
