export interface ErrorDashboardReport {
  id: string;
  message: string;
  stack: string | null;
  appName: string;
  environment: string;
  labels?: Record<string, string>;
  timestampNs?: string;
  url: string;
  userAgent: string;
  userId: string | null;
  sessionId: string | null;
  componentStack: string | null;
  additionalContext: unknown; // JsonValue из Prisma
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  status?: 'new' | 'viewed' | 'resolved' | 'archived'; // статус ошибки
  resolvedAt?: Date | null; // когда ошибка была решена
  resolvedBy?: string | null; // кто решил ошибку (username/userId)
}

export interface ErrorListProps {
  errors: ErrorDashboardReport[];
}

export interface ErrorStatsProps {
  totalErrors: number;
  unresolvedErrors: number;
  errorsByApp: Record<string, number>;
  errorsByEnvironment: Record<string, number>;
}

export interface SessionProviderWrapperProps {
  children: React.ReactNode;
}
