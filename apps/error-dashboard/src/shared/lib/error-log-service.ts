"use server";

import { prisma, Prisma } from "@gafus/prisma";
import { getLogLevel } from "@shared/lib/utils/errorSource";
import type { ErrorDashboardReport } from "@gafus/types";

/**
 * Получает ошибки из PostgreSQL
 */
export async function getErrorsFromDatabase(filters?: {
  appName?: string;
  environment?: string;
  level?: string;
  status?: string;
  limit?: number;
  offset?: number;
  tags?: string[];
  type?: "errors" | "logs" | "all";
}): Promise<{ success: boolean; errors?: ErrorDashboardReport[]; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    
    if (filters?.appName) {
      where.appName = filters.appName;
    }
    
    if (filters?.environment) {
      where.environment = filters.environment;
    }
    
    if (filters?.status) {
      where.status = filters.status;
    }
    
    // Обработка фильтра type для совместимости
    // type: "errors" - только error и fatal
    // type: "logs" - warn, info, debug (но в БД обычно только error/fatal синхронизируются)
    // type: "all" - все уровни
    if (filters?.level) {
      // Поддержка multiple levels: "error|fatal"
      const levels = filters.level.split('|').filter(Boolean);
      if (levels.length > 0) {
        where.level = { in: levels };
      }
    } else if (filters?.type === "errors") {
      // Если указан type: "errors", фильтруем только error и fatal
      where.level = { in: ["error", "fatal"] };
    } else if (filters?.type === "logs") {
      // Если указан type: "logs", фильтруем warn, info, debug
      // Но в БД обычно только error/fatal, поэтому это может вернуть пустой результат
      where.level = { in: ["warn", "info", "debug"] };
    }
    // type: "all" или отсутствие type - не фильтруем по level
    
    if (filters?.tags && filters.tags.length > 0) {
      where.tags = { hasEvery: filters.tags };
    }
    
    const errorLogs = await prisma.errorLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });
    
    const errors: ErrorDashboardReport[] = errorLogs.map(log => ({
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      timestampNs: String(log.timestamp.getTime() * 1000000),
      message: log.message,
      level: log.level,
      stack: log.stack || null,
      appName: log.appName,
      environment: log.environment,
      url: log.url || '',
      userAgent: log.userAgent || '',
      userId: log.userId || null,
      sessionId: log.sessionId || null,
      componentStack: log.componentStack || null,
      additionalContext: log.additionalContext as Record<string, unknown>,
      tags: log.tags,
      createdAt: log.timestamp,
      updatedAt: log.updatedAt,
      status: log.status as 'new' | 'viewed' | 'resolved' | 'archived',
      resolvedAt: log.resolvedAt ? log.resolvedAt.toISOString() : null,
      resolvedBy: log.resolvedBy || null,
      labels: {
        app: log.appName,
        level: log.level,
        environment: log.environment,
        ...(log.context ? { context: log.context } : {}),
        status: log.status,
      },
    }));
    
    return { success: true, errors };
  } catch (error) {
    console.error('[getErrorsFromDatabase] Error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Удаляет ошибку из PostgreSQL
 * Сначала пытается удалить по ID, если не найдено - ищет по уникальным полям
 */
export async function deleteErrorFromDatabase(
  errorId: string,
  fallbackFields?: {
    message: string;
    timestamp: Date;
    appName: string;
    level: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Пытаемся удалить по ID
    try {
      await prisma.errorLog.delete({ where: { id: errorId } });
      return { success: true };
    } catch (deleteError) {
      // Если запись не найдена по ID и есть fallback поля, ищем по уникальным полям
      // Prisma возвращает ошибку с кодом P2025 или сообщением о том, что запись не найдена
      const isRecordNotFoundError =
        deleteError instanceof Error &&
        (deleteError.message.includes("No record was found") ||
          deleteError.message.includes("Record to delete does not exist") ||
          deleteError.message.includes("not found for a delete"));
      
      if (isRecordNotFoundError && fallbackFields) {
        console.warn('[deleteErrorFromDatabase] Record not found by ID, trying to find by fields:', {
          errorId,
          message: fallbackFields.message.substring(0, 100),
          appName: fallbackFields.appName,
          level: fallbackFields.level,
          timestamp: fallbackFields.timestamp.toISOString(),
        });

        // Ищем запись по комбинации полей с окном ±1 секунда для timestamp
        const found = await prisma.errorLog.findFirst({
          where: {
            message: fallbackFields.message,
            appName: fallbackFields.appName,
            level: fallbackFields.level,
            timestamp: {
              gte: new Date(fallbackFields.timestamp.getTime() - 1000),
              lte: new Date(fallbackFields.timestamp.getTime() + 1000),
            },
          },
        });

        if (found) {
          // Удаляем найденную запись по её ID
          await prisma.errorLog.delete({ where: { id: found.id } });
          console.warn('[deleteErrorFromDatabase] Record found and deleted by fields:', {
            errorId,
            foundId: found.id,
          });
          return { success: true };
        }

        console.warn('[deleteErrorFromDatabase] Record not found by fields either:', {
          errorId,
          fallbackFields,
        });
        return {
          success: false,
          error: `Запись не найдена по ID (${errorId}) и по уникальным полям`,
        };
      }

      // Если это другая ошибка или нет fallback полей, пробрасываем её
      throw deleteError;
    }
  } catch (error) {
    console.error('[deleteErrorFromDatabase] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Удаляет все ошибки из PostgreSQL
 */
export async function deleteAllErrorsFromDatabase(): Promise<{ success: boolean; error?: string; deletedCount?: number }> {
  try {
    const result = await prisma.errorLog.deleteMany({});
    console.warn('[deleteAllErrorsFromDatabase] Deleted errors count:', result.count);
    return { success: true, deletedCount: result.count };
  } catch (error) {
    console.error('[deleteAllErrorsFromDatabase] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Обновляет статус ошибки
 */
export async function updateErrorStatus(
  errorId: string, 
  status: 'new' | 'viewed' | 'resolved' | 'archived',
  resolvedBy?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: {
      status: string;
      resolvedAt?: Date | null;
      resolvedBy?: string | null;
    } = { status };

    // Если статус "resolved", устанавливаем resolvedAt и resolvedBy
    if (status === 'resolved') {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = resolvedBy || null;
    } else {
      // Для других статусов очищаем resolvedAt и resolvedBy
      updateData.resolvedAt = null;
      updateData.resolvedBy = null;
    }

    await prisma.errorLog.update({
      where: { id: errorId },
      data: updateData,
    });
    return { success: true };
  } catch (error) {
    console.error('[updateErrorStatus] Error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Синхронизирует лог из Seq в PostgreSQL
 * Проверяет существование по message + timestamp + appName + level
 * Если не существует - создает запись
 */
export async function syncSeqErrorToDatabase(
  error: ErrorDashboardReport
): Promise<{ success: boolean; created?: boolean; error?: string }> {
  try {
    // Извлекаем уровень из лога используя утилиту
    const level = getLogLevel(error) || error.labels?.level || 'error';
    
    // Проверяем, что это error или fatal
    if (level !== 'error' && level !== 'fatal') {
      return { success: true, created: false }; // Не синхронизируем другие уровни
    }

    // Преобразуем timestamp из наносекунд в Date
    const timestamp = error.timestampNs 
      ? new Date(Number(error.timestampNs) / 1000000)
      : (error.createdAt ? new Date(error.createdAt) : new Date());

    // Проверяем существование по уникальной комбинации
    const existing = await prisma.errorLog.findFirst({
      where: {
        message: error.message,
        appName: error.appName,
        level: level,
        timestamp: {
          // Ищем в пределах 1 секунды (на случай небольших расхождений)
          gte: new Date(timestamp.getTime() - 1000),
          lte: new Date(timestamp.getTime() + 1000),
        },
      },
    });

    if (existing) {
      return { success: true, created: false }; // Уже существует
    }

    // Создаем новую запись
    await prisma.errorLog.create({
      data: {
        message: error.message,
        stack: error.stack || null,
        level: level,
        appName: error.appName,
        environment: error.labels?.environment || error.environment || 'development',
        context: error.labels?.context || null,
        url: error.url || null,
        userAgent: error.userAgent || null,
        userId: error.userId || null,
        sessionId: error.sessionId || null,
        componentStack: error.componentStack || null,
        additionalContext: (error.additionalContext || {}) as Prisma.InputJsonValue,
        tags: error.tags || [],
        timestamp: timestamp,
        status: 'new',
      },
    });

    return { success: true, created: true };
  } catch (error) {
    console.error('[syncSeqErrorToDatabase] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Синхронизирует лог из Seq в PostgreSQL (deprecated, используйте syncSeqErrorToDatabase)
 * @deprecated Используйте syncSeqErrorToDatabase
 */
export async function syncLokiErrorToDatabase(
  error: ErrorDashboardReport
): Promise<{ success: boolean; created?: boolean; error?: string }> {
  return syncSeqErrorToDatabase(error);
}

/**
 * Получает статистику ошибок из PostgreSQL
 */
export async function getErrorStatsFromDatabase(): Promise<{
  success: boolean;
  stats?: {
    total: number;
    unresolved: number;
    critical: number;
    byApp: { name: string; count: number }[];
    byEnvironment: { name: string; count: number }[];
  };
  error?: string;
}> {
  try {
    // Получаем все ошибки для статистики
    const allErrors = await prisma.errorLog.findMany({
      select: {
        id: true,
        appName: true,
        environment: true,
        level: true,
        status: true,
      },
    });
    
    const total = allErrors.length;
    const unresolved = allErrors.filter(e => e.status === 'new' || e.status === 'viewed').length;
    const critical = allErrors.filter(e => e.level === 'fatal').length;
    
    // Группировка по приложениям
    const byAppMap = new Map<string, number>();
    allErrors.forEach(error => {
      const appName = error.appName || 'unknown';
      byAppMap.set(appName, (byAppMap.get(appName) || 0) + 1);
    });
    
    const byApp: { name: string; count: number }[] = Array.from(byAppMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    // Группировка по окружениям
    const byEnvironmentMap = new Map<string, number>();
    allErrors.forEach(error => {
      const env = error.environment || 'unknown';
      byEnvironmentMap.set(env, (byEnvironmentMap.get(env) || 0) + 1);
    });
    
    const byEnvironment: { name: string; count: number }[] = Array.from(byEnvironmentMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    return {
      success: true,
      stats: {
        total,
        unresolved,
        critical,
        byApp,
        byEnvironment,
      },
    };
  } catch (error) {
    console.error('[getErrorStatsFromDatabase] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

