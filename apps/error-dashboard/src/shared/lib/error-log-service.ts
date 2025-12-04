"use server";

import { prisma } from "@gafus/prisma";
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
    
    if (filters?.level) {
      // Поддержка multiple levels: "error|fatal"
      const levels = filters.level.split('|').filter(Boolean);
      if (levels.length > 0) {
        where.level = { in: levels };
      }
    }
    
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
      message: log.message,
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
      labels: {
        app: log.appName,
        level: log.level,
        environment: log.environment,
        ...(log.context ? { context: log.context } : {}),
        status: log.status,
      },
      timestampNs: String(log.timestamp.getTime() * 1000000),
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
 */
export async function deleteErrorFromDatabase(errorId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.errorLog.delete({ where: { id: errorId } });
    return { success: true };
  } catch (error) {
    console.error('[deleteErrorFromDatabase] Error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Обновляет статус ошибки
 */
export async function updateErrorStatus(
  errorId: string, 
  status: 'new' | 'viewed' | 'resolved' | 'archived'
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.errorLog.update({
      where: { id: errorId },
      data: { status },
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

