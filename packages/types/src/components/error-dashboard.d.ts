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
    additionalContext: unknown;
    createdAt: Date;
    updatedAt: Date;
    tags: string[];
    status?: 'new' | 'viewed' | 'resolved' | 'archived';
    resolvedAt?: Date | null;
    resolvedBy?: string | null;
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
//# sourceMappingURL=error-dashboard.d.ts.map