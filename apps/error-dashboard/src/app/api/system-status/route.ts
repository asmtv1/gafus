import { NextResponse } from "next/server";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("system-status");

// Типы для статуса сервисов
interface ServiceStatus {
  name: string;
  status: "online" | "offline" | "unknown";
  url?: string;
  responseTime?: number;
  error?: string;
}

interface DatabaseStatus {
  name: string;
  status: "online" | "offline" | "error";
  responseTime?: number;
  error?: string;
  details?: {
    version?: string;
    connections?: number;
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

// Проверка статуса сервиса по HTTP
async function checkServiceStatus(
  name: string,
  url: string
): Promise<ServiceStatus> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    return {
      name,
      status: response.ok ? "online" : "offline",
      url,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      name,
      status: "offline",
      url,
      responseTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Проверка PostgreSQL
async function checkPostgresStatus(): Promise<DatabaseStatus> {
  const startTime = Date.now();
  
  try {
    // Простой запрос для проверки подключения
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;

    // Получаем версию PostgreSQL
    const versionResult = await prisma.$queryRaw<{ version: string }[]>`
      SELECT version()
    `;
    const version = versionResult[0]?.version || "Unknown";

    // Получаем количество активных подключений
    const connectionsResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) as count FROM pg_stat_activity
    `;
    const connections = Number(connectionsResult[0]?.count || 0);

    return {
      name: "PostgreSQL",
      status: "online",
      responseTime,
      details: {
        version: version.split(" ")[1], // Берем только версию
        connections,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      name: "PostgreSQL",
      status: "error",
      responseTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Проверка Redis
async function checkRedisStatus(): Promise<DatabaseStatus> {
  const startTime = Date.now();
  
  try {
    // Динамический импорт Redis connection
    const { connection: redisConnection } = await import("@gafus/queues");
    
    // Проверяем подключение к Redis
    await redisConnection.ping();
    const responseTime = Date.now() - startTime;

    // Получаем информацию о Redis
    const info = await redisConnection.info("server");
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    const version = versionMatch ? versionMatch[1] : "Unknown";

    return {
      name: "Redis",
      status: "online",
      responseTime,
      details: {
        version,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      name: "Redis",
      status: "error",
      responseTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Получение системных метрик
async function getSystemMetrics(): Promise<SystemMetrics> {
  const os = await import("os");

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    memory: {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      percentage: (usedMemory / totalMemory) * 100,
    },
    cpu: {
      count: os.cpus().length,
      model: os.cpus()[0]?.model || "Unknown",
      usage: os.loadavg()[0], // 1-минутная средняя загрузка
    },
    uptime: os.uptime(),
  };
}

export async function GET() {
  try {
    logger.info("Получение статуса системы");

    // Определяем URL сервисов на основе окружения
    const isProduction = process.env.NODE_ENV === "production";
    const baseUrl = isProduction ? "http://localhost" : "http://localhost";

    // Проверяем статус всех сервисов параллельно
    const [webStatus, trainerStatus, adminStatus, bullBoardStatus] = await Promise.all([
      checkServiceStatus("Web App", `${baseUrl}:3000/api/health`),
      checkServiceStatus("Trainer Panel", `${baseUrl}:3001/api/health`),
      checkServiceStatus("Admin Panel", `${baseUrl}:3002/api/health`),
      checkServiceStatus("Bull Board", `${baseUrl}:3006/health`),
    ]);

    // Проверяем базы данных параллельно
    const [postgresStatus, redisStatus] = await Promise.all([
      checkPostgresStatus(),
      checkRedisStatus(),
    ]);

    // Получаем системные метрики
    const metrics = await getSystemMetrics();

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

