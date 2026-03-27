/**
 * Клиентский Tracer (JS): ручной reportClientError, глобальный handler, ErrorBoundary.
 * Не дублирует нативные краши без JS-стека; сбои сети при upload батча не репортятся повторно.
 */
export { installGlobalJsErrorHandler } from "./installGlobalJsErrorHandler";
export { reportClientError } from "./reportClientError";
export { isTracerEnabled } from "./tracerConfig";
export type { ClientErrorData } from "./types";
