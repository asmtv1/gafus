export interface ErrorDashboardReport {
  id: string;
  message: string;
  stack: string | null;
  appName: string;
  environment: string;
  url: string;
  userAgent: string;
  userId: string | null;
  sessionId: string | null;
  componentStack: string | null;
  additionalContext: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  resolved: boolean;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  tags: string[];
}
export interface ErrorListProps {
  errors: ErrorDashboardReport[];
}
export interface ErrorStatsProps {
  totalErrors: number;
  resolvedErrors: number;
  unresolvedErrors: number;
  errorsByApp: Record<string, number>;
  errorsByEnvironment: Record<string, number>;
}
export interface SessionProviderWrapperProps {
  children: React.ReactNode;
}
//# sourceMappingURL=error-dashboard.d.ts.map
