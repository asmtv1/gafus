export interface PerformanceMetrics {
  pageLoadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  firstInputDelay: number;
}

export interface ErrorMetrics {
  errorCount: number;
  errorRate: number;
  mostCommonErrors: {
    message: string;
    count: number;
  }[];
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics = new Map<string, number>();
  private errors = new Map<string, number>();

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  recordMetric(name: string, value: number): void {
    this.metrics.set(name, value);
  }

  recordError(error: Error): void {
    const key = error.message;
    const count = this.errors.get(key) || 0;
    this.errors.set(key, count + 1);
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return {
      pageLoadTime: this.metrics.get("pageLoadTime") || 0,
      firstContentfulPaint: this.metrics.get("firstContentfulPaint") || 0,
      largestContentfulPaint: this.metrics.get("largestContentfulPaint") || 0,
      cumulativeLayoutShift: this.metrics.get("cumulativeLayoutShift") || 0,
      firstInputDelay: this.metrics.get("firstInputDelay") || 0,
    };
  }

  getErrorMetrics(): ErrorMetrics {
    const totalErrors = Array.from(this.errors.values()).reduce((sum, count) => sum + count, 0);
    const mostCommonErrors = Array.from(this.errors.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      errorCount: totalErrors,
      errorRate: totalErrors / 100, // Простая метрика
      mostCommonErrors,
    };
  }

  reset(): void {
    this.metrics.clear();
    this.errors.clear();
  }
}

// Глобальный экземпляр
export const metricsCollector = MetricsCollector.getInstance();
