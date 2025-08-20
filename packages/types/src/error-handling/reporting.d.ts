import type { ReactNode, ComponentType } from "react";
export interface ErrorInfo {
  componentStack: string;
  errorBoundaryName?: string;
  appName?: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  timestamp?: number;
}
export interface ErrorBoundaryConfig {
  appName: string;
  environment: "development" | "staging" | "production";
  logToConsole?: boolean;
  showErrorDetails?: boolean;
  customErrorComponent?: ComponentType<{
    error: Error | null;
    errorInfo: ErrorInfo | null;
    onReset: () => void;
    showDetails?: boolean;
  }>;
}
export interface GlobalErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  config?: Partial<ErrorBoundaryConfig>;
}
export interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}
export interface ErrorReport {
  error: Error;
  errorInfo: ErrorInfo;
  config: ErrorBoundaryConfig;
}
//# sourceMappingURL=reporting.d.ts.map
