import type { ErrorDashboardReport } from "@gafus/types";
import http from "http";
import https from "https";
import { URL } from "url";

// Константы для работы с временными периодами
const DAY_MS = 24 * 60 * 60 * 1000; // миллисекунды в сутках
const DEFAULT_LOOKBACK_MS = 7 * DAY_MS; // 7 суток (безопасный лимит для Loki)

/**
 * Генерирует детерминированный ID для ошибки
 * Один и тот же лог всегда получит один и тот же ID
 * 
 * @param app - Имя приложения
 * @param timestamp - Timestamp в наносекундах (строка)
 * @param message - Сообщение ошибки
 * @returns Детерминированный hash (10 символов base36)
 */
function generateErrorId(app: string, timestamp: string, message: string): string {
  // Создаем hash от app + timestamp + message
  const hashInput = `${app}-${timestamp}-${message}`;
  let hash = 0;
  
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Возвращаем только hash (без app и timestamp в ID)
  // 10 символов для лучшей уникальности
  return Math.abs(hash).toString(36).substring(0, 10);
}

/**
 * Клиент для работы с Loki API
 */
export class LokiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Приоритет: переданный baseUrl > LOKI_URL > localhost (локально) > loki (Docker)
    // По умолчанию используем localhost для локальной разработки
    // В Docker нужно явно указать LOKI_URL=http://loki:3100
    const defaultUrl = "http://localhost:3100";
    this.baseUrl = baseUrl || process.env.LOKI_URL || defaultUrl;
  }

  /**
   * Выполняет LogQL запрос к Loki
   */
  async query(query: string, limit: number = 1000, startTime?: Date, endTime?: Date): Promise<ErrorDashboardReport[]> {
    const queryUrl = `${this.baseUrl}/loki/api/v1/query_range`;
    
    try {
      const url = new URL(queryUrl);
      url.searchParams.set("query", query);
      url.searchParams.set("limit", String(limit));
      
      // Используем переданный временной диапазон или диапазон по умолчанию (7 дней)
      let end: number;
      let start: number;
      
      if (startTime && endTime) {
        // Конвертируем Date в наносекунды
        end = endTime.getTime() * 1000000;
        start = startTime.getTime() * 1000000;
      } else {
        // За последние 7 дней (безопасный лимит для Loki)
        end = Date.now() * 1000000; // наносекунды
        start = (Date.now() - DEFAULT_LOOKBACK_MS) * 1000000;
      }
      
      url.searchParams.set("start", String(start));
      url.searchParams.set("end", String(end));

      console.warn('[LokiClient.query] FUNCTION CALLED with query:', query);
      console.warn('[LokiClient.query] Time range:', {
        start: new Date(parseInt(String(start)) / 1000000).toISOString(),
        end: new Date(parseInt(String(end)) / 1000000).toISOString(),
        customRange: !!(startTime && endTime),
        durationMs: (end - start) / 1000000,
      });

      const requestUrl = url.toString();
      
      // Логирование для отладки (всегда, не только в development)
      console.warn('[LokiClient] Query request:', {
        query,
        limit,
        start: new Date(parseInt(String(start)) / 1000000).toISOString(),
        end: new Date(parseInt(String(end)) / 1000000).toISOString(),
        url: requestUrl,
      });

      // Используем встроенный http/https модуль вместо fetch для работы с Docker DNS
      const data = await new Promise<{
        data?: {
          result?: {
            stream?: Record<string, string>;
            values?: [string, string][];
          }[];
        };
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
                reject(new Error(`Failed to parse Loki response: ${parseError instanceof Error ? parseError.message : String(parseError)}`));
              }
            } else {
              // Распознаем ошибку про matcher, которая на самом деле может быть ошибкой периода
              if (responseData && responseData.includes("queries require at least one regexp or equality matcher")) {
                const improvedMessage = `Диапазон запроса превышает лимит Loki (30 суток). Используется lookback 29 суток. Если ошибка сохраняется, проверьте конфигурацию Loki. Оригинальная ошибка: ${responseData.substring(0, 200)}`;
                reject(new Error(improvedMessage));
              } else {
                const errorMessage = `Loki query failed: ${res.statusCode} ${res.statusMessage}. URL: ${this.baseUrl}. ${responseData ? `Response: ${responseData.substring(0, 200)}` : ""}`;
                reject(new Error(errorMessage));
              }
            }
          });
        });

        req.on('error', (error) => {
          reject(new Error(`Не удалось подключиться к Loki. URL: ${this.baseUrl}. Проверьте, что Loki доступен и переменная окружения LOKI_URL настроена правильно. Ошибка: ${error.message}`));
        });

        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error(`Timeout при подключении к Loki. URL: ${this.baseUrl}`));
        });

        req.end();
      });
      
      // Логирование результатов (всегда, не только в development)
      const resultCount = data?.data?.result?.length || 0;
      const totalEntries = resultCount > 0 && data?.data?.result
        ? data.data.result.reduce((sum: number, stream: { values?: unknown[] }) => sum + (stream.values?.length || 0), 0)
        : 0;
      
      console.warn('[LokiClient] Query response:', {
        query,
        resultCount,
        totalStreams: resultCount,
        totalEntries,
        sampleLabels: resultCount > 0 && data?.data?.result?.[0] ? Object.keys(data.data.result[0]?.stream || {}) : [],
      });
      
      const parsedResults = this.parseLokiResponse(data);
      
      console.warn('[LokiClient] Parsed results:', {
        query,
        parsedCount: parsedResults.length,
        sampleIds: parsedResults.slice(0, 3).map(r => r.id),
      });
      
      return parsedResults;
    } catch (error) {
      // Обработка специфичных ошибок
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error(
          `Не удалось подключиться к Loki. URL: ${this.baseUrl}. Проверьте, что Loki доступен и переменная окружения LOKI_URL настроена правильно. Ошибка: ${error.message}`
        );
      }
      
      if (error instanceof Error) {
        // Если ошибка уже содержит информацию о URL, просто пробрасываем
        if (error.message.includes("Loki query failed")) {
          throw error;
        }
        throw new Error(
          `Ошибка при запросе к Loki (${this.baseUrl}): ${error.message}`
        );
      }
      
      console.error("Loki query error:", error);
      throw new Error(
        `Неизвестная ошибка при запросе к Loki (${this.baseUrl}): ${String(error)}`
      );
    }
  }

  /**
   * Парсит ответ Loki в формат ErrorDashboardReport
   */
  private parseLokiResponse(data: {
    data?: {
      result?: {
        stream?: Record<string, string>;
        values?: [string, string][];
      }[];
    };
  }): ErrorDashboardReport[] {
    const results: ErrorDashboardReport[] = [];

    if (!data.data || !data.data.result) {
      console.warn('[LokiClient.parseLokiResponse] No data or result in response');
      return results;
    }

    console.warn('[LokiClient.parseLokiResponse] Parsing response:', {
      streamCount: data.data.result.length,
      totalValues: data.data.result.reduce((sum, stream) => sum + (stream.values?.length || 0), 0),
    });

    const normalizeLevel = (value?: unknown): string | undefined => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      return trimmed.toLowerCase();
    };

    const ensureStringArray = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value
          .map((item) => (typeof item === "string" ? item : null))
          .filter((item): item is string => Boolean(item && item.trim()));
      }
      return [];
    };

    for (const stream of data.data.result) {
      const labels = stream.stream || {};
      const normalizedLabels = Object.entries(labels).reduce<Record<string, string>>(
        (acc, [key, value]) => {
          if (value === undefined || value === null) return acc;
          acc[key] = typeof value === "string" ? value : String(value);
          return acc;
        },
        {},
      );
      const values = stream.values || [];

      for (const [timestamp, logLine] of values) {
        try {
          // Парсим JSON из содержимого лога
          const logData = JSON.parse(logLine);
          const tags = ensureStringArray(logData.tags);

          // Определяем, является ли это push-логом
          const isPushLog = labels.tag_push_notifications === 'true' || 
                           logData.tags?.includes('push-notifications') ||
                           labels.app === 'worker';

          // Формируем additionalContext с pushSpecific для push-логов
          const rawAdditionalContext = logData.additionalContext;
          let additionalContext: Record<string, unknown>;
          if (typeof rawAdditionalContext === 'string') {
            try {
              additionalContext = JSON.parse(rawAdditionalContext) as Record<string, unknown>;
            } catch {
              additionalContext = {};
            }
          } else if (rawAdditionalContext && typeof rawAdditionalContext === 'object') {
            additionalContext = { ...(rawAdditionalContext as Record<string, unknown>) };
          } else {
            additionalContext = {};
          }

          const levelFromLog = normalizeLevel(logData.level);
          const levelFromLabels = normalizeLevel(labels.level);
          const levelFromContext = normalizeLevel(
            typeof additionalContext.level === 'string' ? additionalContext.level : undefined
          );
          const levelFromTags = normalizeLevel(tags[0]);
          const resolvedLevel = levelFromLog
            || levelFromContext
            || levelFromLabels
            || levelFromTags
            || 'error';

          if (!additionalContext.level) {
            additionalContext.level = resolvedLevel;
          }

          if (!tags.includes(resolvedLevel)) {
            tags.unshift(resolvedLevel);
          }

          if (isPushLog) {
            const existingPushSpecific =
              typeof additionalContext['pushSpecific'] === 'object' && additionalContext['pushSpecific'] !== null
                ? (additionalContext['pushSpecific'] as Record<string, unknown>)
                : {};
            const fallbackContext =
              (typeof additionalContext['context'] === 'string' ? additionalContext['context'] : labels.context) ||
              'unknown';
            const fallbackService =
              (typeof additionalContext['service'] === 'string' ? additionalContext['service'] : labels.app) ||
              'unknown';
            const timestampValue =
              (typeof additionalContext['timestamp'] === 'string'
                ? additionalContext['timestamp']
                : logData.timestamp) || new Date(parseInt(timestamp) / 1000000).toISOString();

            additionalContext['pushSpecific'] = {
              ...existingPushSpecific,
              level: resolvedLevel,
              context: fallbackContext,
              service: fallbackService,
              timestamp: timestampValue,
              endpoint:
                (typeof additionalContext['endpoint'] === 'string'
                  ? additionalContext['endpoint']
                  : logData.endpoint) || null,
              notificationId:
                (typeof additionalContext['notificationId'] === 'string'
                  ? additionalContext['notificationId']
                  : logData.notificationId) || null,
            };
          }

          // Формируем ErrorDashboardReport
          const report: ErrorDashboardReport = {
            id: generateErrorId(
              labels.app || "unknown",
              timestamp,
              logData.message || logLine
            ),
            message: logData.message || logLine,
            stack: logData.stack || null,
            appName: labels.app || logData.appName || "unknown",
            environment: labels.environment || logData.environment || "development",
            labels: normalizedLabels,
            timestampNs: timestamp,
            url: logData.url || "/logger",
            userAgent: logData.userAgent || "logger-service",
            userId: logData.userId || null,
            sessionId: logData.sessionId || null,
            componentStack: logData.componentStack || null,
            additionalContext,
            tags,
            createdAt: new Date(parseInt(timestamp) / 1000000), // наносекунды в миллисекунды
            updatedAt: new Date(parseInt(timestamp) / 1000000),
          };

          results.push(report);
        } catch (parseError) {
          // Если не удалось распарсить JSON, создаём базовую запись
          console.warn('[LokiClient.parseLokiResponse] Failed to parse log line:', {
            timestamp,
            logLine: logLine.substring(0, 200),
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
          
          // Для логов контейнеров извлекаем информацию из labels
          const isContainerLog = labels.tag_container_logs === 'true' || labels.job === 'docker';
          let containerName = 'unknown';
          let appName = labels.app || 'unknown';
          
          // Маппинг container_id -> имя контейнера (известные контейнеры)
          const containerIdToName: Record<string, string> = {
            '6e062042c39f': 'gafus-loki',
            '83a97c5e1dc9': 'gafus-promtail',
            'bf7045b8d739': 'gafus-nginx',
            'e2abf3a50008': 'gafus-error-dashboard',
            'b09a3c2c00a3': 'gafus-trainer-panel',
            'cdd55a2c5280': 'gafus-web',
            '3fac6bf7e795': 'gafus-bull-board',
            '50a1b05b69fe': 'gafus-admin-panel',
            'd0263b2acf44': 'gafus-prometheus',
          };
          
          if (isContainerLog) {
            // Получаем container_id из labels
            const containerId = labels.container_id;
            if (containerId) {
              // Пытаемся найти имя контейнера по полному ID или первым 12 символам
              containerName = containerIdToName[containerId] || 
                             containerIdToName[containerId.substring(0, 12)] ||
                             containerId.substring(0, 12);
              
              // Извлекаем appName из имени контейнера (gafus-loki -> loki)
              const nameMatch = containerName.match(/gafus-(.+)/);
              appName = nameMatch ? nameMatch[1] : containerName;
            } else if (labels.filename) {
              const match = labels.filename.match(/\/([^/]+)-json\.log$/);
              if (match) {
                const id = match[1].substring(0, 12);
                containerName = containerIdToName[id] || id;
                appName = containerName.replace('gafus-', '');
              }
            }
          }
          
          // Парсим текстовый лог в формате key=value (Loki/Grafana формат)
          let parsedMessage = logLine;
          let parsedLevel = labels.level || 'info';
          let parsedCaller: string | undefined;
          let parsedMsg: string | undefined;
          let parsedTs: string | undefined;
          
          if (isContainerLog && logLine.includes('=')) {
            // Парсим формат: level=info ts=2025-12-05T20:21:09.880892204Z caller=... msg="..."
            const parts = logLine.split(/\s+(?=\w+=)/);
            const parsed: Record<string, string> = {};
            
            for (const part of parts) {
              const match = part.match(/^(\w+)=(.+)$/);
              if (match) {
                const key = match[1];
                let value = match[2];
                
                // Убираем кавычки если есть
                if (value.startsWith('"') && value.endsWith('"')) {
                  value = value.slice(1, -1);
                }
                
                parsed[key] = value;
              }
            }
            
            if (parsed.level) parsedLevel = parsed.level;
            if (parsed.ts) parsedTs = parsed.ts;
            if (parsed.caller) parsedCaller = parsed.caller;
            if (parsed.msg) {
              parsedMsg = parsed.msg;
              parsedMessage = parsed.msg; // Используем msg как основное сообщение
            } else if (parsed.message) {
              parsedMsg = parsed.message;
              parsedMessage = parsed.message;
            }
          }
          
          const report: ErrorDashboardReport = {
            id: generateErrorId(
              appName,
              timestamp,
              logLine
            ),
            message: parsedMessage,
            stack: null,
            appName,
            environment: labels.environment || "production",
            labels: normalizedLabels,
            timestampNs: timestamp,
            url: "/logger",
            userAgent: "logger-service",
            userId: null,
            sessionId: null,
            componentStack: null,
            additionalContext: {
              raw: logLine,
              ...(isContainerLog ? {
                container: {
                  name: containerName,
                  id: labels.container_id || containerName,
                  timestamp: parsedTs || new Date(parseInt(timestamp) / 1000000).toISOString(),
                  raw: logLine,
                  ...(parsedCaller ? { caller: parsedCaller } : {}),
                  ...(parsedMsg ? { originalMsg: parsedMsg } : {}),
                },
                parsed: {
                  level: parsedLevel,
                  ...(parsedTs ? { timestamp: parsedTs } : {}),
                  ...(parsedCaller ? { caller: parsedCaller } : {}),
                  ...(parsedMsg ? { msg: parsedMsg } : {}),
                },
              } : {}),
            },
            tags: [
              parsedLevel,
              ...Object.keys(labels)
                .filter((k) => k.startsWith("tag_"))
                .map((k) => k.replace("tag_", "")),
              ...(isContainerLog ? ['container-logs'] : []),
              ...(containerName !== 'unknown' ? [`container:${containerName}`] : []),
            ],
            createdAt: new Date(parseInt(timestamp) / 1000000),
            updatedAt: new Date(parseInt(timestamp) / 1000000),
          };

          results.push(report);
        }
      }
    }

    // Сортируем по дате (новые сначала)
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
    // Формируем LogQL запрос
    const labelMatchers: string[] = [];
    const isContainerLogs = filters?.tags?.includes("container-logs");

    // Для логов контейнеров (container-logs) используем job="docker" и tag_container_logs="true"
    // Теперь Promtail также добавляет метку app из Pino JSON, поэтому можно фильтровать по app
    if (isContainerLogs) {
      // Всегда добавляем job="docker" для контейнерных логов
      labelMatchers.push(`job="docker"`);
      // Если указан appName, добавляем фильтр по app (Promtail добавляет метку app из Pino JSON)
      if (filters?.appName) {
        labelMatchers.push(`app="${filters.appName}"`);
      }
    } else {
      // Для ошибок приложений используем метку app
      if (filters?.appName) {
        labelMatchers.push(`app="${filters.appName}"`);
      } else {
        // Если нет appName, используем app=~".+" для всех приложений
        // Promtail должен добавлять метку app из Pino JSON логов
        labelMatchers.push(`app=~".+"`);
      }
    }

    if (filters?.level) {
      // Если level содержит |, используем regex matcher
      if (filters.level.includes('|')) {
        labelMatchers.push(`level=~"${filters.level}"`);
      } else {
        labelMatchers.push(`level="${filters.level}"`);
      }
    }

    if (filters?.container) {
      labelMatchers.push(`container_name=~".*${filters.container}.*"`);
    }

    if (filters?.tags) {
      for (const tag of filters.tags) {
        labelMatchers.push(`tag_${tag.replace("-", "_")}="true"`);
      }
    }

    // Базовый запрос - все логи
    // Loki требует хотя бы один matcher, который не имеет пустого значения
    let query = "{";
    if (labelMatchers.length > 0) {
      query += labelMatchers.join(",");
    } else {
      // Если нет фильтров, добавляем matcher для всех приложений с уровнем error|fatal
      // Это используется для получения всех ошибок приложений
      query += `app=~".+",level=~"error|fatal"`;
    }
    query += "}";

    // Для контейнерных логов используем больший дефолтный лимит (5000 - максимум для Loki)
    // Loki имеет ограничение max_entries_limit_per_query = 5000
    const defaultLimit = isContainerLogs ? 5000 : 1000;
    const limit = filters?.limit || defaultLimit;

    console.warn('[LokiClient.getLogs] FUNCTION CALLED with filters:', JSON.stringify(filters));
    console.warn('[LokiClient.getLogs] Forming query:', {
      filters,
      labelMatchers,
      query,
      limit,
      isContainerLogs,
    });

    const result = await this.query(query, limit, filters?.startTime, filters?.endTime);
    
    console.warn('[LokiClient.getLogs] Query result:', {
      resultCount: result.length,
      sampleIds: result.slice(0, 3).map(r => r.id),
    });
    
    return result;
  }

  /**
   * Удаляет логи из Loki по фильтрам
   * 
   * @param filters - Фильтры для удаления логов
   * @returns Результат операции удаления
   */
  async deleteLogs(filters?: {
    appName?: string;
    level?: string;
    environment?: string;
    context?: string;
    serviceName?: string;
    tags?: string[];
    container?: string;
    labels?: Record<string, string>;
    startTime?: Date;
    endTime?: Date;
    startIso?: string;
    endIso?: string;
  }): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      console.warn('[LokiClient.deleteLogs] Начало операции удаления', {
        filters,
        baseUrl: this.baseUrl,
      });

      // Валидация базового URL
      if (!this.baseUrl) {
        const error = "Loki baseUrl не настроен";
        console.error('[LokiClient.deleteLogs]', error);
        return {
          success: false,
          error,
        };
      }

      const deleteUrl = `${this.baseUrl}/loki/api/v1/delete`;
      
      // Формируем LogQL запрос для удаления
      const labelMatchers: string[] = [];
      const matcherSet = new Set<string>();

      const escapeLabelValue = (value: string): string =>
        value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      const addMatcher = (matcher: string) => {
        if (!matcherSet.has(matcher)) {
          matcherSet.add(matcher);
          labelMatchers.push(matcher);
        }
      };

      const addEqualityMatcher = (key: string, value?: string | null) => {
        if (!value) return;
        addMatcher(`${key}="${escapeLabelValue(value)}"`);
      };

      if (filters?.appName) {
        addEqualityMatcher("app", filters.appName);
      }

      if (filters?.level) {
        // Если level содержит |, используем regex matcher
        if (filters.level.includes("|")) {
          addMatcher(`level=~"${filters.level}"`);
        } else {
          addEqualityMatcher("level", filters.level);
        }
      }

      if (filters?.environment) {
        addEqualityMatcher("environment", filters.environment);
      }

      if (filters?.context) {
        addEqualityMatcher("context", filters.context);
      }

      if (filters?.serviceName) {
        addEqualityMatcher("service_name", filters.serviceName);
      }

      if (filters?.container) {
        addMatcher(`container_name=~".*${filters.container}.*"`);
      }

      if (filters?.tags) {
        for (const tag of filters.tags) {
          addEqualityMatcher(`tag_${tag.replace("-", "_")}`, "true");
        }
      }

      // НЕ используем filters.labels для автоматического добавления matchers
      // Используем только явно указанные параметры (appName, level, environment, context, serviceName, container)
      // Это предотвращает добавление tag_* labels, которые могут не совпадать с реальными labels в stream

      // Если нет фильтров, добавляем базовый matcher app=~".+"
      // Loki требует хотя бы один regexp или equality matcher, который не имеет пустого значения
      if (labelMatchers.length === 0) {
        console.warn('[LokiClient.deleteLogs] Нет фильтров, используем app=~".+" для безопасности');
        addMatcher(`app=~".+"`);
      }

      // Формируем запрос
      let query = "{";
      if (labelMatchers.length > 0) {
        query += labelMatchers.join(",");
      }
      query += "}";

      const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

      const ensureDate = (date: Date, label: string): Date | null => {
        if (isNaN(date.getTime())) {
          console.error('[LokiClient.deleteLogs]', `Некорректная дата ${label}`, { date });
          return null;
        }
        return date;
      };

      const fallbackEndTime = filters?.endTime || new Date();
      const fallbackStartTime =
        filters?.startTime || new Date(fallbackEndTime.getTime() - DAYS_30_MS);

      const parseIso = (value?: string, label?: string): Date | null => {
        if (!value) return null;
        const parsed = new Date(value);
        if (isNaN(parsed.getTime())) {
          console.error('[LokiClient.deleteLogs]', `Некорректный ISO формат ${label}`, { value });
          return null;
        }
        return parsed;
      };

      const resolvedStart =
        parseIso(filters?.startIso, "startIso") ||
        ensureDate(filters?.startTime || fallbackStartTime, "startTime");
      const resolvedEnd =
        parseIso(filters?.endIso, "endIso") ||
        ensureDate(filters?.endTime || fallbackEndTime, "endTime");

      if (!resolvedStart || !resolvedEnd) {
        return {
          success: false,
          error: "Некорректные параметры времени для удаления",
        };
      }

      if (resolvedStart >= resolvedEnd) {
        const error = "start время должно быть меньше end времени";
        console.error('[LokiClient.deleteLogs]', error, {
          startIso: resolvedStart.toISOString(),
          endIso: resolvedEnd.toISOString(),
        });
        return {
          success: false,
          error,
        };
      }

      const startIso = resolvedStart.toISOString();
      const endIso = resolvedEnd.toISOString();
      const durationMs = resolvedEnd.getTime() - resolvedStart.getTime();

      // Loki API требует параметры в query string, а не в теле запроса
      let url: URL;
      try {
        url = new URL(deleteUrl);
        url.searchParams.set("query", query);
        url.searchParams.set("start", startIso);
        url.searchParams.set("end", endIso);
      } catch (urlError) {
        const error = `Не удалось сформировать URL для удаления: ${urlError instanceof Error ? urlError.message : String(urlError)}`;
        console.error('[LokiClient.deleteLogs]', error, { deleteUrl });
        return {
          success: false,
          error,
        };
      }

      const requestUrl = url.toString();

      console.warn('[LokiClient.deleteLogs] Параметры запроса на удаление:', {
        query,
        labelMatchers: Array.from(labelMatchers),
        labelMatchersCount: labelMatchers.length,
        timeRange: {
          start: startIso,
          end: endIso,
          durationMs,
          durationSeconds: Math.round(durationMs / 1000),
        },
        startIso,
        endIso,
        fullUrl: requestUrl,
        baseUrl: this.baseUrl,
        deleteEndpoint: deleteUrl,
      });

      const requestStartTime = Date.now();
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const requestDuration = Date.now() - requestStartTime;

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      console.warn('[LokiClient.deleteLogs] Ответ от Loki:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        requestDurationMs: requestDuration,
        headers: responseHeaders,
        headerCount: Object.keys(responseHeaders).length,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        const errorMessage = `Loki delete failed: ${response.status} ${response.statusText}. ${errorText ? `Response: ${errorText.substring(0, 200)}` : ""}`;
        
        console.error('[LokiClient.deleteLogs] Ошибка удаления:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText,
          errorTextLength: errorText.length,
          errorTextPreview: errorText.substring(0, 1000),
          requestUrl,
          query,
          labelMatchers: Array.from(labelMatchers),
          timeRange: { start: startIso, end: endIso },
          requestDurationMs: requestDuration,
          headers: responseHeaders,
        });
        
        throw new Error(errorMessage);
      }

      // Loki возвращает 204 No Content при успешном удалении
      if (response.status === 204) {
        console.warn('[LokiClient.deleteLogs] Удаление успешно (204 No Content)', {
          query,
          labelMatchers: Array.from(labelMatchers),
          timeRange: {
            start: startIso,
            end: endIso,
            durationMs,
          },
          requestUrl,
          requestDurationMs: requestDuration,
          headers: responseHeaders,
        });
        return { success: true, message: "Логи успешно удалены из Loki" };
      }

      // Если есть тело ответа, пытаемся его распарсить
      try {
        const responseText = await response.text();
        let data: unknown;
        try {
          data = JSON.parse(responseText);
        } catch {
          data = responseText;
        }
        
        console.warn('[LokiClient.deleteLogs] Удаление успешно (с телом ответа):', {
          status: response.status,
          responseBody: data,
          responseText: typeof responseText === 'string' ? responseText : String(responseText),
          responseTextLength: typeof responseText === 'string' ? responseText.length : 0,
          query,
          labelMatchers: Array.from(labelMatchers),
          requestUrl,
          requestDurationMs: requestDuration,
          headers: responseHeaders,
        });
        
        return { 
          success: true, 
          message: (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') 
            ? data.message 
            : "Логи успешно удалены" 
        };
      } catch (parseError) {
        console.warn('[LokiClient.deleteLogs] Удаление успешно (не удалось распарсить тело ответа):', {
          status: response.status,
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          query,
          labelMatchers: Array.from(labelMatchers),
          requestUrl,
          requestDurationMs: requestDuration,
          headers: responseHeaders,
        });
        return { success: true, message: "Логи успешно удалены из Loki" };
      }
    } catch (error) {
      console.error('[LokiClient.deleteLogs] Исключение при удалении:', error);
      
      if (error instanceof Error) {
        return {
          success: false,
          error: `Не удалось удалить логи из Loki: ${error.message}`,
        };
      }
      return {
        success: false,
        error: `Неизвестная ошибка при удалении логов из Loki: ${String(error)}`,
      };
    }
  }
}

// Создаём singleton экземпляр
let lokiClientInstance: LokiClient | null = null;

/**
 * Получает экземпляр Loki клиента
 */
export function getLokiClient(): LokiClient {
  if (!lokiClientInstance) {
    lokiClientInstance = new LokiClient();
  }
  return lokiClientInstance;
}

/**
 * Выполняет LogQL запрос
 */
export async function queryLoki(query: string, limit?: number): Promise<ErrorDashboardReport[]> {
  const client = getLokiClient();
  return client.query(query, limit);
}

/**
 * Получает логи по фильтрам
 */
export async function getLogsFromLoki(filters?: {
  appName?: string;
  level?: string;
  tags?: string[];
  container?: string;
  limit?: number;
}): Promise<ErrorDashboardReport[]> {
  const client = getLokiClient();
  return client.getLogs(filters);
}

