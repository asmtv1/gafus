import { NextResponse } from "next/server";
import { createWebLogger } from "@gafus/logger";
import {
  getSystemMetricsFromPrometheus,
  getPostgresMetricsFromPrometheus,
  getRedisMetricsFromPrometheus,
  getServiceMetricsFromPrometheus,
} from "@shared/lib/prometheus";

const logger = createWebLogger("system-status");

// Типы для статуса сервисов
interface ServiceStatus {
  name: string;
  status: "online" | "offline" | "unknown";
  url?: string;
  responseTime?: number;
  error?: string;
  httpStatusCode?: number;
}

interface DatabaseStatus {
  name: string;
  status: "online" | "offline" | "error";
  responseTime?: number;
  error?: string;
  details?: {
    version?: string;
    connections?: number;
    // PostgreSQL расширенные метрики
    databaseSize?: number;
    cacheHitRatio?: number;
    transactions?: {
      commits?: number;
      rollbacks?: number;
    };
    queries?: {
      selects?: number;
      inserts?: number;
      updates?: number;
      deletes?: number;
    };
    deadlocks?: number;
    waitingQueries?: number;
    // Redis расширенные метрики
    memory?: {
      used?: number;
      max?: number;
      percentage?: number;
    };
    keys?: {
      total?: number;
      expired?: number;
      evicted?: number;
    };
    cache?: {
      hits?: number;
      misses?: number;
      hitRatio?: number;
    };
    commands?: {
      processed?: number;
      perSecond?: number;
    };
  };
}

interface SystemMetrics {
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  cpu: {
    count: number;
    model: string;
    usage: number;
  };
  uptime: number;
}

interface SystemStatusResponse {
  timestamp: string;
  services: ServiceStatus[];
  databases: DatabaseStatus[];
  metrics: SystemMetrics;
}

// Преобразование метрик сервиса из Prometheus в формат UI
function mapServiceMetricsToStatus(
  name: string,
  url: string,
  metrics: Awaited<ReturnType<typeof getServiceMetricsFromPrometheus>>
): ServiceStatus {
  // Конвертируем "error" в "offline" для совместимости с UI
  const status = metrics.status === "error" ? "offline" : metrics.status;
  
  return {
    name,
    status: status as "online" | "offline" | "unknown",
    url,
    responseTime: metrics.responseTime,
    error: metrics.error,
    httpStatusCode: metrics.httpStatusCode,
  };
}

// Преобразование метрик PostgreSQL из Prometheus в формат UI
function mapPostgresMetricsToStatus(
  metrics: Awaited<ReturnType<typeof getPostgresMetricsFromPrometheus>>
): DatabaseStatus {
  return {
    name: "PostgreSQL",
    status: metrics.status,
    responseTime: metrics.responseTime,
    error: metrics.error,
    details: metrics.status === "online" ? {
      version: metrics.version,
      connections: metrics.connections,
      databaseSize: metrics.databaseSize,
      cacheHitRatio: metrics.cacheHitRatio,
      transactions: metrics.transactions,
      queries: metrics.queries,
      deadlocks: metrics.deadlocks,
      waitingQueries: metrics.waitingQueries,
    } : undefined,
  };
}

// Преобразование метрик Redis из Prometheus в формат UI
function mapRedisMetricsToStatus(
  metrics: Awaited<ReturnType<typeof getRedisMetricsFromPrometheus>>
): DatabaseStatus {
  return {
    name: "Redis",
    status: metrics.status,
    responseTime: metrics.responseTime,
    error: metrics.error,
    details: metrics.status === "online" ? {
      version: metrics.version,
      connections: metrics.connections,
      memory: metrics.memory,
      keys: metrics.keys,
      cache: metrics.cache,
      commands: metrics.commands,
    } : undefined,
  };
}


export async function GET() {
  try {
    logger.info("Получение статуса системы");

    // Определяем URL сервисов на основе окружения
    // Для Prometheus используем те же URL, что указаны в конфигурации blackbox_exporter
    const isProduction = process.env.NODE_ENV === "production";

    // В production используем имена Docker сервисов, в development - host.docker.internal
    // Важно: URL должны совпадать с теми, что указаны в prometheus.yml
    // Порты: Web App=3002, Trainer Panel=3001, Admin Panel=3006, Bull Board=3004
    const [webMetrics, trainerMetrics, adminMetrics, bullBoardMetrics] = await Promise.all([
      getServiceMetricsFromPrometheus(
        "Web App",
        isProduction ? "http://web:3000/api/health" : "http://host.docker.internal:3002/api/health"
      ),
      getServiceMetricsFromPrometheus(
        "Trainer Panel",
        isProduction ? "http://trainer-panel:3001/api/health" : "http://host.docker.internal:3001/api/health"
      ),
      getServiceMetricsFromPrometheus(
        "Admin Panel",
        isProduction ? "http://admin-panel:3006/api/health" : "http://host.docker.internal:3006/api/health"
      ),
      getServiceMetricsFromPrometheus(
        "Bull Board",
        isProduction ? "http://bull-board:3002/health" : "http://host.docker.internal:3004/health"
      ),
    ]);

    const webStatus = mapServiceMetricsToStatus(
      "Web App",
      isProduction ? "http://web:3000/api/health" : "http://host.docker.internal:3002/api/health",
      webMetrics
    );
    const trainerStatus = mapServiceMetricsToStatus(
      "Trainer Panel",
      isProduction ? "http://trainer-panel:3001/api/health" : "http://host.docker.internal:3001/api/health",
      trainerMetrics
    );
    const adminStatus = mapServiceMetricsToStatus(
      "Admin Panel",
      isProduction ? "http://admin-panel:3006/api/health" : "http://host.docker.internal:3006/api/health",
      adminMetrics
    );
    const bullBoardStatus = mapServiceMetricsToStatus(
      "Bull Board",
      isProduction ? "http://bull-board:3002/health" : "http://host.docker.internal:3004/health",
      bullBoardMetrics
    );
    
    logger.info("Метрики сервисов получены из Prometheus", {
      web: webStatus.status,
      trainer: trainerStatus.status,
      admin: adminStatus.status,
      bullBoard: bullBoardStatus.status,
    });

        // Проверяем базы данных через Prometheus параллельно
        logger.info("Получение метрик баз данных из Prometheus");
        let postgresStatus: DatabaseStatus;
        let redisStatus: DatabaseStatus;
        
        try {
          const postgresMetrics = await getPostgresMetricsFromPrometheus();
          postgresStatus = mapPostgresMetricsToStatus(postgresMetrics);
        } catch (error) {
          logger.error("Ошибка получения метрик PostgreSQL из Prometheus", error as Error);
          postgresStatus = {
            name: "PostgreSQL",
            status: "error",
            responseTime: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
        
        try {
          const redisMetrics = await getRedisMetricsFromPrometheus();
          redisStatus = mapRedisMetricsToStatus(redisMetrics);
        } catch (error) {
          logger.error("Ошибка получения метрик Redis из Prometheus", error as Error);
          redisStatus = {
            name: "Redis",
            status: "error",
            responseTime: 0,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
        logger.info("Метрики баз данных получены", {
          postgres: postgresStatus.status,
          redis: redisStatus.status,
        });

    // Получаем системные метрики из Prometheus
    let metrics: SystemMetrics;
    try {
      logger.info("Получение метрик из Prometheus", { 
        prometheusUrl: process.env.PROMETHEUS_URL || "не установлен",
        nodeEnv: process.env.NODE_ENV 
      });
      metrics = await getSystemMetricsFromPrometheus();
      logger.info("Метрики получены из Prometheus", { 
        memoryTotal: metrics.memory.total,
        memoryTotalGB: (metrics.memory.total / 1024 / 1024 / 1024).toFixed(2)
      });
    } catch (error) {
      logger.error("Ошибка получения метрик из Prometheus", error as Error, {
        prometheusUrl: process.env.PROMETHEUS_URL || "не установлен"
      });
      return NextResponse.json(
        {
          error: "Failed to get system metrics from Prometheus",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 503 }
      );
    }

    const response: SystemStatusResponse = {
      timestamp: new Date().toISOString(),
      services: [webStatus, trainerStatus, adminStatus, bullBoardStatus],
      databases: [postgresStatus, redisStatus],
      metrics,
    };

    logger.success("Статус системы получен успешно");
    return NextResponse.json(response);
  } catch (error) {
    logger.error("Ошибка при получении статуса системы", error as Error);
    return NextResponse.json(
      {
        error: "Failed to get system status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

