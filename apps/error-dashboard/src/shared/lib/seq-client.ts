import type { ErrorDashboardReport } from "@gafus/types";
import http from "http";
import https from "https";
import { URL } from "url";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Константы для работы с временными периодами
const DAY_MS = 24 * 60 * 60 * 1000; // миллисекунды в сутках
const DEFAULT_LOOKBACK_MS = 7 * DAY_MS; // 7 суток

// Кэш для имен контейнеров (container_id -> container_name)
const containerNameCache = new Map<string, string>();
let containerMappingFetched = false;
let containerMappingPromise: Promise<void> | null = null;

/**
 * Загружает маппинг контейнеров напрямую через docker ps (без HTTP запроса)
 * Работает только на сервере, где доступен Docker
 */
async function fetchContainerMapping(): Promise<void> {
  if (containerMappingFetched) return;
  
  // Если уже идет загрузка, ждем её
  if (containerMappingPromise) {
    return containerMappingPromise;
  }
  
  containerMappingPromise = (async () => {
    try {
      // Получаем список контейнеров напрямую через docker ps
      const { stdout } = await execAsync("docker ps --format '{{.ID}}\t{{.Names}}' 2>/dev/null || echo ''");
      
      const mapping: Record<string, string> = {};
      const lines = stdout.trim().split("\n").filter((line) => line.trim());
      
      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length >= 2) {
          const id = parts[0]?.trim();
          const name = parts[1]?.trim();
          if (id && name) {
            // Кэшируем и полный ID, и короткий (первые 12 символов)
            containerNameCache.set(id, name);
            if (id.length >= 12) {
              containerNameCache.set(id.substring(0, 12), name);
            }
            mapping[id] = name;
          }
        }
      }
      
      containerMappingFetched = true;
      if (Object.keys(mapping).length > 0) {
        console.warn("[SeqClient] Container mapping loaded:", Object.keys(mapping).length, "containers");
      }
    } catch (error) {
      // Игнорируем ошибки - используем fallback
      // Docker может быть недоступен (например, в dev окружении)
      // Санитизируем сообщение об ошибке для предотвращения command injection
      const errorMessage = error instanceof Error 
        ? error.message.replace(/[`$();|&]/g, '') 
        : String(error).replace(/[`$();|&]/g, '');
      console.warn("[SeqClient] Failed to fetch container mapping:", errorMessage);
    } finally {
      containerMappingPromise = null;
    }
  })();
  
  return containerMappingPromise;
}

/**
 * Определяет имя контейнера из доступных данных
 */
function getContainerName(
  containerId: string | undefined,
  properties: Record<string, unknown>
): string {
  // 1. Пытаемся использовать ContainerName из properties
  if (properties.ContainerName && typeof properties.ContainerName === 'string') {
    const containerName = properties.ContainerName;
    if (containerId) {
      containerNameCache.set(containerId, containerName);
      containerNameCache.set(containerId.substring(0, 12), containerName);
    }
    return containerName;
  }

  // 2. Пытаемся использовать App из properties
  if (properties.App && typeof properties.App === 'string') {
    const appName = properties.App;
    const containerName = appName.startsWith('gafus-') ? appName : `gafus-${appName}`;
    if (containerId) {
      containerNameCache.set(containerId, containerName);
      containerNameCache.set(containerId.substring(0, 12), containerName);
    }
    return containerName;
  }

  // 3. Используем кэш
  if (containerId) {
    const cached = containerNameCache.get(containerId) || containerNameCache.get(containerId.substring(0, 12));
    if (cached) {
      return cached;
    }
  }

  // 4. Fallback - используем короткий container_id
  return containerId ? containerId.substring(0, 12) : 'unknown';
}

/**
 * Генерирует уникальный ID для ошибки
 */
function generateErrorId(appName: string, timestamp: string, message: string): string {
  const hash = Buffer.from(`${appName}-${timestamp}-${message}`).toString('base64').substring(0, 16);
  return `${appName}-${timestamp}-${hash}`;
}

/**
 * Нормализует уровень лога
 */
function normalizeLevel(value?: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (["debug", "info", "warn", "error", "fatal"].includes(normalized)) {
    return normalized;
  }
  return undefined;
}

/**
 * Преобразует уровень Seq в стандартный формат
 */
function normalizeSeqLevel(seqLevel: string): string {
  const levelMap: Record<string, string> = {
    'Verbose': 'debug',
    'Debug': 'debug',
    'Information': 'info',
    'Warning': 'warn',
    'Error': 'error',
    'Fatal': 'fatal',
  };
  return levelMap[seqLevel] || seqLevel.toLowerCase();
}

/**
 * Преобразует уровень из стандартного формата в формат Seq для SQL запросов
 */
function toSeqLevelFormat(level: string): string {
  const levelMap: Record<string, string> = {
    'debug': 'Debug',
    'info': 'Information',
    'warn': 'Warning',
    'error': 'Error',
    'fatal': 'Fatal',
    'trace': 'Verbose',
  };
  // Если уровень уже в формате Seq (с заглавной буквы), возвращаем как есть
  if (level === 'Verbose' || level === 'Debug' || level === 'Information' || 
      level === 'Warning' || level === 'Error' || level === 'Fatal') {
    return level;
  }
  return levelMap[level.toLowerCase()] || 'Information';
}

/**
 * Клиент для работы с Seq API
 */
export class SeqClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Приоритет: переданный baseUrl > SEQ_URL > localhost (локально) > seq (Docker)
    const defaultUrl = "http://localhost:5341";
    this.baseUrl = baseUrl || process.env.SEQ_URL || defaultUrl;
  }

  /**
   * Выполняет SQL-подобный запрос к Seq
   */
  async query(
    sqlQuery: string,
    limit: number = 1000,
    startTime?: Date,
    endTime?: Date
  ): Promise<ErrorDashboardReport[]> {
    const queryUrl = `${this.baseUrl}/api/events`;
    
    try {
      const url = new URL(queryUrl);
      
      // Формируем параметры запроса
      url.searchParams.set("q", sqlQuery);
      url.searchParams.set("count", String(limit));
      
      // Используем переданный временной диапазон или диапазон по умолчанию (7 дней)
      const end = endTime || new Date();
      const start = startTime || new Date(Date.now() - DEFAULT_LOOKBACK_MS);
      
      url.searchParams.set("start", start.toISOString());
      url.searchParams.set("end", end.toISOString());

      console.warn('[SeqClient.query] FUNCTION CALLED with query:', sqlQuery);
      console.warn('[SeqClient.query] Time range:', {
        start: start.toISOString(),
        end: end.toISOString(),
        customRange: !!(startTime && endTime),
      });

      const requestUrl = url.toString();
      
      console.warn('[SeqClient] Query request:', {
        query: sqlQuery,
        limit,
        start: start.toISOString(),
        end: end.toISOString(),
        url: requestUrl,
      });

      // Используем встроенный http/https модуль вместо fetch для работы с Docker DNS
      const data = await new Promise<{
        Events?: {
          Timestamp?: string;
          Level?: string;
          MessageTemplate?: string;
          Properties?: Record<string, unknown>;
          Exception?: string;
          RenderedMessage?: string;
        }[];
      }>((resolve, reject) => {
        const requestUrlObj = new URL(requestUrl);
        const isHttps = requestUrlObj.protocol === 'https:';
        const httpModule = isHttps ? https : http;
        
        const options = {
          hostname: requestUrlObj.hostname,
          port: requestUrlObj.port || (isHttps ? 443 : 80),
          path: requestUrlObj.pathname + requestUrlObj.search,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        };

        const req = httpModule.request(options, (res) => {
          let responseData = '';

          res.on('data', (chunk) => {
            responseData += chunk;
          });

          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsedData = JSON.parse(responseData);
                resolve(parsedData);
              } catch (parseError) {
                reject(new Error(`Failed to parse Seq response: ${parseError instanceof Error ? parseError.message : String(parseError)}`));
              }
            } else {
              const errorMessage = `Seq query failed: ${res.statusCode} ${res.statusMessage}. URL: ${this.baseUrl}. ${responseData ? `Response: ${responseData.substring(0, 200)}` : ""}`;
              reject(new Error(errorMessage));
            }
          });
        });

        req.on('error', (error) => {
          reject(new Error(`Не удалось подключиться к Seq. URL: ${this.baseUrl}. Проверьте, что Seq доступен и переменная окружения SEQ_URL настроена правильно. Ошибка: ${error.message}`));
        });

        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error(`Timeout при подключении к Seq. URL: ${this.baseUrl}`));
        });

        req.end();
      });
      
      const resultCount = data?.Events?.length || 0;
      console.warn('[SeqClient] Query response:', {
        query: sqlQuery,
        resultCount,
      });
      
      const parsedResults = this.parseSeqResponse(data);
      
      console.warn('[SeqClient] Parsed results:', {
        query: sqlQuery,
        parsedCount: parsedResults.length,
        sampleIds: parsedResults.slice(0, 3).map(r => r.id),
      });
      
      return parsedResults;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error(
          `Не удалось подключиться к Seq. URL: ${this.baseUrl}. Проверьте, что Seq доступен и переменная окружения SEQ_URL настроена правильно. Ошибка: ${error.message}`
        );
      }
      
      if (error instanceof Error) {
        if (error.message.includes("Seq query failed")) {
          throw error;
        }
        throw new Error(
          `Ошибка при запросе к Seq (${this.baseUrl}): ${error.message}`
        );
      }
      
      const errorMessage = error instanceof Error 
        ? error.message.replace(/[`$();|&]/g, '') 
        : String(error).replace(/[`$();|&]/g, '');
      console.error("Seq query error:", errorMessage);
      throw new Error(
        `Неизвестная ошибка при запросе к Seq (${this.baseUrl}): ${String(error)}`
      );
    }
  }

  /**
   * Парсит ответ Seq в формат ErrorDashboardReport
   */
  private parseSeqResponse(data: {
    Events?: {
      Timestamp?: string;
      Level?: string;
      MessageTemplate?: string;
      Properties?: Record<string, unknown>;
      Exception?: string;
      RenderedMessage?: string;
    }[];
  }): ErrorDashboardReport[] {
    const results: ErrorDashboardReport[] = [];

    if (!data.Events || !Array.isArray(data.Events)) {
      console.warn('[SeqClient.parseSeqResponse] No Events in response');
      return results;
    }

    console.warn('[SeqClient.parseSeqResponse] Parsing response:', {
      eventCount: data.Events.length,
    });

    for (const event of data.Events) {
      try {
        const timestamp = event.Timestamp || new Date().toISOString();
        const timestampNs = String(new Date(timestamp).getTime() * 1000000);
        
        const properties = event.Properties || {};
        const level = normalizeSeqLevel(event.Level || 'Information');
        const message = event.RenderedMessage || event.MessageTemplate || '';
        
        // Извлекаем информацию из properties
        const app = typeof properties.App === 'string' ? properties.App : undefined;
        const context = typeof properties.Context === 'string' ? properties.Context : undefined;
        const containerId = typeof properties.ContainerId === 'string' ? properties.ContainerId : undefined;
        const containerName = getContainerName(containerId, properties);
        
        // Формируем labels
        const labels: Record<string, string> = {
          app: app || containerName.replace('gafus-', '') || 'unknown',
          environment: typeof properties.environment === 'string' ? properties.environment : 'production',
          level,
        };
        
        if (containerId) {
          labels.container_id = containerId;
        }
        if (containerName) {
          labels.container_name = containerName;
        }
        if (context) {
          labels.context = context;
        }

        // Формируем tags
        const tags: string[] = [level];
        if (properties.tag_container_logs === true || properties.tag_container_logs === 'true') {
          tags.push('container-logs');
        }
        if (containerName !== 'unknown') {
          tags.push(`container:${containerName}`);
        }

        // Формируем additionalContext
        const additionalContext: Record<string, unknown> = {
          ...properties,
        };

        if (containerId) {
          additionalContext.container = {
            name: containerName,
            id: containerId,
            timestamp,
          };
        }

        // Формируем ErrorDashboardReport
        const report: ErrorDashboardReport = {
          id: generateErrorId(
            labels.app,
            timestampNs,
            message
          ),
          timestamp: timestamp,
          timestampNs,
          message,
          level,
          stack: event.Exception || null,
          appName: labels.app,
          environment: labels.environment,
          labels,
          url: typeof properties.url === 'string' ? properties.url : '/logger',
          userAgent: typeof properties.userAgent === 'string' ? properties.userAgent : 'logger-service',
          userId: typeof properties.userId === 'string' ? properties.userId : null,
          sessionId: typeof properties.sessionId === 'string' ? properties.sessionId : null,
          componentStack: typeof properties.componentStack === 'string' ? properties.componentStack : null,
          additionalContext,
          tags,
          createdAt: new Date(timestamp),
          updatedAt: new Date(timestamp),
        };

        results.push(report);
      } catch (parseError) {
        console.warn('[SeqClient.parseSeqResponse] Failed to parse event:', {
          event,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
      }
    }

    // Сортируем по дате (новые сначала)
    return results.sort((a, b) => {
      const aTime = a.createdAt ? (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : a.createdAt.getTime()) : 0;
      const bTime = b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : b.createdAt.getTime()) : 0;
      return bTime - aTime;
    });
  }

  /**
   * Получает логи по фильтрам
   */
  async getLogs(filters?: {
    appName?: string;
    level?: string;
    tags?: string[];
    container?: string;
    limit?: number;
    startTime?: Date;
    endTime?: Date;
  }): Promise<ErrorDashboardReport[]> {
    // Формируем SQL-подобный запрос для Seq
    // Seq использует специальный синтаксис для свойств: Properties['Key'] или @Properties['Key']
    const conditions: string[] = [];
    const isContainerLogs = filters?.tags?.includes("container-logs");

    // Базовое условие для контейнерных логов
    if (isContainerLogs) {
      conditions.push("@Properties['tag_container_logs'] = 'true'");
    }

    // Фильтр по appName
    if (filters?.appName) {
      conditions.push(`@Properties['App'] = '${filters.appName.replace(/'/g, "''")}'`);
    }

    // Фильтр по level
    if (filters?.level) {
      if (filters.level.includes('|')) {
        // Для нескольких уровней используем IN
        // Конвертируем наш формат (error, fatal) в формат Seq (Error, Fatal)
        const levels = filters.level.split('|').map(l => `'${toSeqLevelFormat(l.trim())}'`).join(', ');
        conditions.push(`Level IN (${levels})`);
      } else {
        // Конвертируем наш формат в формат Seq для SQL запроса
        conditions.push(`Level = '${toSeqLevelFormat(filters.level)}'`);
      }
    }

    // Фильтр по container
    if (filters?.container) {
      conditions.push(`@Properties['ContainerName'] like '%${filters.container.replace(/'/g, "''")}%'`);
    }

    // Формируем SQL запрос
    let sqlQuery = "select * from stream";
    if (conditions.length > 0) {
      sqlQuery += " where " + conditions.join(" and ");
    }
    sqlQuery += " order by Timestamp desc";

    const defaultLimit = isContainerLogs ? 5000 : 1000;
    const limit = filters?.limit || defaultLimit;

    console.warn('[SeqClient.getLogs] FUNCTION CALLED with filters:', JSON.stringify(filters));
    console.warn('[SeqClient.getLogs] Forming query:', {
      filters,
      sqlQuery,
      limit,
      isContainerLogs,
    });

    const result = await this.query(sqlQuery, limit, filters?.startTime, filters?.endTime);
    
    console.warn('[SeqClient.getLogs] Query result:', {
      resultCount: result.length,
      sampleIds: result.slice(0, 3).map(r => r.id),
    });
    
    return result;
  }

  /**
   * Потоковое получение логов через polling (Seq не поддерживает SSE в Node.js напрямую)
   * 
   * @param sqlQuery - SQL-подобный запрос
   * @param onLog - Callback для обработки каждого лога
   * @param limit - Максимальное количество логов в буфере (по умолчанию 1000)
   * @returns Функция для остановки потока
   */
  streamLogs(
    sqlQuery: string,
    onLog: (log: ErrorDashboardReport) => void,
    limit: number = 1000
  ): () => void {
    let isActive = true;
    let pollInterval: NodeJS.Timeout | null = null;
    let lastTimestamp = new Date(Date.now() - 60000); // Начинаем с минуты назад

    const startPolling = () => {
      if (!isActive) return;

      console.warn("[SeqClient.streamLogs] Starting polling stream");
      
      pollInterval = setInterval(async () => {
        if (!isActive) {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          return;
        }

        try {
          // Добавляем условие по времени к запросу
          const timeCondition = `Timestamp > '${lastTimestamp.toISOString()}'`;
          const fullQuery = sqlQuery.includes('where') 
            ? `${sqlQuery} and ${timeCondition}`
            : `${sqlQuery} where ${timeCondition}`;
          
          const logs = await this.query(fullQuery, limit, lastTimestamp);

          // Обрабатываем логи в порядке времени (старые сначала)
          const sortedLogs = logs.sort((a, b) => {
            const aTime = a.createdAt ? (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : a.createdAt.getTime()) : 0;
            const bTime = b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : b.createdAt.getTime()) : 0;
            return aTime - bTime;
          });

          for (const log of sortedLogs) {
            if (!log.createdAt) continue;
            const logTimestamp = typeof log.createdAt === 'string' ? new Date(log.createdAt) : log.createdAt;
            if (isActive && logTimestamp > lastTimestamp) {
              onLog(log);
              if (logTimestamp > lastTimestamp) {
                lastTimestamp = logTimestamp;
              }
            }
          }
        } catch (error) {
          console.error("[SeqClient.streamLogs] Polling error:", error);
        }
      }, 1000); // Poll каждую секунду
    };

    startPolling();

    // Функция остановки
    return () => {
      isActive = false;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  }
}

// Создаём singleton экземпляр
let seqClientInstance: SeqClient | null = null;

/**
 * Получает экземпляр Seq клиента
 */
export function getSeqClient(): SeqClient {
  if (!seqClientInstance) {
    seqClientInstance = new SeqClient();
    // Загружаем маппинг контейнеров при первом создании клиента
    fetchContainerMapping().catch(() => {
      // Игнорируем ошибки
    });
  }
  return seqClientInstance;
}

/**
 * Выполняет SQL-подобный запрос к Seq
 */
export async function querySeq(sqlQuery: string, limit?: number): Promise<ErrorDashboardReport[]> {
  const client = getSeqClient();
  return client.query(sqlQuery, limit);
}

/**
 * Получает логи по фильтрам
 */
export async function getLogsFromSeq(filters?: {
  appName?: string;
  level?: string;
  tags?: string[];
  container?: string;
  limit?: number;
}): Promise<ErrorDashboardReport[]> {
  const client = getSeqClient();
  return client.getLogs(filters);
}

