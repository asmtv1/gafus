/**
 * @gafus/error-handling - Обработка ошибок и React Error Boundaries
 * 
 * Этот пакет содержит:
 * - React Error Boundaries для перехвата ошибок UI
 * - ErrorReporter для отправки ошибок в error-dashboard
 */

// React компоненты
export { ErrorBoundary } from "./react/ErrorBoundary";
export type { 
  ErrorBoundaryProps, 
  ErrorBoundaryState, 
  ErrorBoundaryConfig 
} from "./react/ErrorBoundary";

// Re-export из @gafus/logger для обратной совместимости
export { 
  ErrorReporter,
  type ErrorInfo,
  type ErrorReporterConfig,
} from "@gafus/logger";

// Типы из @gafus/types для обратной совместимости
export type { ErrorInfo as ErrorInfoType, ErrorBoundaryConfig as ErrorBoundaryConfigType } from "@gafus/types";
