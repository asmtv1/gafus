// Типы для error-dashboard приложения

export interface ErrorDashboardReport {
  id: string;
  timestamp: string; // Для совместимости со старым кодом
  timestampNs?: string; // Наносекунды для Seq
  message: string;
  level: string;
  appName: string;
  environment: string;
  stack?: string | null;
  componentStack?: string | null;
  additionalContext?: Record<string, unknown>;
  tags?: string[];
  userId?: string | null;
  sessionId?: string | null;
  url?: string;
  userAgent?: string;
  ip?: string;
  resolved?: boolean;
  resolvedAt?: string | Date | null;
  resolvedBy?: string | null;
  notes?: string;
  occurrences?: number;
  firstOccurrence?: string;
  lastOccurrence?: string;
  // Дополнительные поля для работы с БД
  createdAt?: Date | string;
  updatedAt?: Date | string;
  status?: "new" | "viewed" | "resolved" | "archived";
  labels?: {
    app?: string;
    level?: string;
    environment?: string;
    context?: string;
    status?: string;
    [key: string]: string | undefined;
  };
}
