// Типы для error-dashboard приложения

export interface ErrorDashboardReport {
  id: string;
  timestamp: string;
  message: string;
  level: string;
  appName: string;
  environment: string;
  stack?: string;
  additionalContext?: Record<string, unknown>;
  tags?: string[];
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  ip?: string;
  resolved?: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
  occurrences?: number;
  firstOccurrence?: string;
  lastOccurrence?: string;
}
