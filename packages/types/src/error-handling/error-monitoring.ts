import type { ComponentType, ReactNode } from "../types";

export interface ErrorMonitoringConfig {
  appName: string;
  environment: "development" | "staging" | "production";
  logToConsole?: boolean;
  showErrorDetails?: boolean;
  maxErrors?: number;
  errorRetentionDays?: number;
}

export interface ErrorInfo {
  message?: string;
  stack?: string;
  componentStack?: string;
  timestamp?: number;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  additionalData?: Record<string, unknown>;
  // Дополнительные поля для совместимости
  errorBoundaryName?: string;
  appName?: string;
}

export interface ErrorBoundaryConfig {
  appName: string;
  environment: "development" | "staging" | "production";
  logToConsole?: boolean;
  showErrorDetails?: boolean;
  maxErrors?: number;
  errorRetentionDays?: number;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ComponentType<{ error: Error; resetError: () => void }>;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  config?: ErrorBoundaryConfig;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}
