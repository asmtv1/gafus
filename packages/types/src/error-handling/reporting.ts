import type { ComponentType, ReactNode } from "../types";

export interface ErrorReportingConfig {
  appName: string;
  environment: "development" | "staging" | "production";
  logToConsole?: boolean;
  showErrorDetails?: boolean;
  maxErrors?: number;
  errorRetentionDays?: number;
}

export interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  additionalData?: Record<string, unknown>;
}

// ErrorReporterProps и ErrorReporterState удалены - используйте ErrorBoundary из @gafus/error-handling
