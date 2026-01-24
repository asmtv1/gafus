/**
 * @gafus/error-handling - Обработка ошибок и React Error Boundaries
 *
 * Этот пакет содержит:
 * - React Error Boundaries для перехвата ошибок UI
 * - Автоматическая отправка ошибок через @gafus/logger в Loki
 */

// React компоненты
export { ErrorBoundary } from "./react/ErrorBoundary";
export type {
  ErrorBoundaryProps,
  ErrorBoundaryState,
  ErrorBoundaryConfig,
  ErrorInfo,
} from "./react/ErrorBoundary";
