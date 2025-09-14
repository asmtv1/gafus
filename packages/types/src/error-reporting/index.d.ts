export interface ErrorReportData {
    message: string;
    stack?: string;
    appName: string;
    environment: string;
    url?: string;
    userAgent?: string;
    userId?: string;
    sessionId?: string;
    componentStack?: string;
    additionalContext?: Record<string, unknown>;
    tags?: string[];
}
export interface ErrorFilters {
    appNames: string[];
    environments: string[];
    dateRange: {
        from: Date | null;
        to: Date | null;
    };
}
export interface ValidationResult {
    isValid: boolean;
    errors: Record<string, string | null>;
}
//# sourceMappingURL=index.d.ts.map