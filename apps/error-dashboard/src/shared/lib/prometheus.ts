/**
 * Утилита для работы с Prometheus API
 */

// Определяем URL Prometheus с учетом окружения
// В production используем имя Docker сервиса, в development - localhost
function getPrometheusUrl(): string {
  if (process.env.PROMETHEUS_URL) {
    return process.env.PROMETHEUS_URL;
  }
  
  // В production используем имя Docker сервиса
  if (process.env.NODE_ENV === "production") {
    return "http://prometheus:9090";
  }
  
  // В development используем localhost
  return "http://localhost:9090";
}

const PROMETHEUS_URL = getPrometheusUrl();

interface PrometheusQueryResponse {
  status: string;
  data: {
    resultType: string;
    result: {
      metric: Record<string, string>;
      value: [number, string];
    }[];
  };
}

interface PrometheusQueryResult {
  value: number;
  labels?: Record<string, string>;
}

/**
 * Выполнить PromQL запрос к Prometheus
 */
async function queryPrometheus(query: string): Promise<PrometheusQueryResult[]> {
  const url = new URL(`${PROMETHEUS_URL}/api/v1/query`);
  url.searchParams.set("query", query);

  // Логирование запросов только в development режиме через logger
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[Prometheus] Querying:", url.toString());
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const errorMsg = `Failed to connect to Prometheus at ${PROMETHEUS_URL} (NODE_ENV: ${process.env.NODE_ENV || "undefined"}): ${error instanceof Error ? error.message : "Unknown error"}`;
    if (process.env.NODE_ENV === "development") {
      console.error("[Prometheus] Connection error:", errorMsg);
    }
    throw new Error(errorMsg);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Prometheus query failed (${response.status}): ${errorText}`);
  }

  const data: PrometheusQueryResponse = await response.json();

  if (data.status !== "success") {
    const errorMsg = data.data?.result ? 
      `Prometheus query error: ${data.status}` : 
      `Prometheus query error: ${data.status}. Query: ${query}`;
    throw new Error(errorMsg);
  }

  return data.data.result.map((item) => ({
    value: parseFloat(item.value[1]),
    labels: item.metric,
  }));
}

/**
 * Получить одно значение из Prometheus запроса
 */
async function querySingleValue(query: string): Promise<number> {
  const results = await queryPrometheus(query);
  if (results.length === 0) {
    // Более детальная ошибка для диагностики
    const errorMsg = `No results for query: ${query}. Prometheus URL: ${PROMETHEUS_URL} (NODE_ENV: ${process.env.NODE_ENV || "undefined"}). Проверьте, что метрика существует и Prometheus собирает данные.`;
    if (process.env.NODE_ENV === "development") {
      console.error("[Prometheus] Query failed:", errorMsg);
      // Попробуем получить список доступных метрик для диагностики
      try {
        const metricsUrl = new URL(`${PROMETHEUS_URL}/api/v1/label/__name__/values`);
        const metricsResponse = await fetch(metricsUrl.toString());
        if (metricsResponse.ok) {
          const metricsData = await metricsResponse.json();
          const relevantMetrics = metricsData.data?.filter((m: string) => 
            query.includes("pg_") ? m.includes("pg_") : m.includes("redis_")
          ) || [];
          // eslint-disable-next-line no-console
          console.log("[Prometheus] Available relevant metrics:", relevantMetrics.slice(0, 10));
        }
      } catch {
        // Игнорируем ошибку диагностики
      }
    }
    throw new Error(errorMsg);
  }
  return results[0].value;
}

/**
 * Получить системные метрики из Prometheus
 */
export interface SystemMetrics {
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

export async function getSystemMetricsFromPrometheus(): Promise<SystemMetrics> {
  try {
    // Получаем метрики памяти
    const [memTotal, memAvailable] = await Promise.all([
      querySingleValue('node_memory_MemTotal_bytes'),
      querySingleValue('node_memory_MemAvailable_bytes'),
    ]);

    const memUsed = memTotal - memAvailable;
    const memPercentage = (memUsed / memTotal) * 100;

    // Получаем информацию о CPU
    // Количество логических ядер через count уникальных CPU
    const cpuCountResult = await queryPrometheus('count(node_cpu_seconds_total{mode="idle"}) by (instance)');
    const cpuCount = cpuCountResult.length > 0 ? Math.round(cpuCountResult[0].value) : 1;
    
    // Модель CPU из node_cpu_info
    const cpuInfo = await queryPrometheus('node_cpu_info');
    const cpuModel = cpuInfo.length > 0 ? (cpuInfo[0].labels?.model_name || "Unknown") : "Unknown";

    // Получаем загрузку CPU (используем load average за 1 минуту)
    const cpuLoad = await querySingleValue('node_load1');

    // Получаем uptime
    const bootTime = await querySingleValue('node_boot_time_seconds');
    const currentTime = Date.now() / 1000;
    const uptime = currentTime - bootTime;

    return {
      memory: {
        total: memTotal,
        used: memUsed,
        free: memAvailable,
        percentage: memPercentage,
      },
      cpu: {
        count: cpuCount,
        model: cpuModel,
        usage: cpuLoad,
      },
      uptime: Math.floor(uptime),
    };
  } catch (error) {
    throw new Error(
      `Failed to get system metrics from Prometheus: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Интерфейс для метрик PostgreSQL
 */
export interface PostgresMetrics {
  status: "online" | "error";
  responseTime: number;
  version?: string;
  connections?: number;
  // Детальные метрики для отладки и масштабирования
  databaseSize?: number; // Размер БД в байтах
  cacheHitRatio?: number; // Процент попаданий в кэш (0-100)
  transactions?: {
    commits?: number; // Количество успешных транзакций
    rollbacks?: number; // Количество откатов
  };
  queries?: {
    selects?: number; // Количество SELECT запросов
    inserts?: number; // Количество INSERT запросов
    updates?: number; // Количество UPDATE запросов
    deletes?: number; // Количество DELETE запросов
  };
  deadlocks?: number; // Количество deadlocks
  waitingQueries?: number; // Количество запросов в ожидании
  error?: string;
}

/**
 * Интерфейс для метрик Redis
 */
export interface RedisMetrics {
  status: "online" | "error";
  responseTime: number;
  version?: string;
  // Детальные метрики для отладки и масштабирования
  memory?: {
    used?: number; // Использовано памяти в байтах
    max?: number; // Максимальная память в байтах
    percentage?: number; // Процент использования (0-100)
  };
  keys?: {
    total?: number; // Общее количество ключей
    expired?: number; // Количество истекших ключей
    evicted?: number; // Количество удаленных ключей из-за нехватки памяти
  };
  cache?: {
    hits?: number; // Количество попаданий в кэш
    misses?: number; // Количество промахов кэша
    hitRatio?: number; // Процент попаданий (0-100)
  };
  commands?: {
    processed?: number; // Количество обработанных команд
    perSecond?: number; // Команд в секунду
  };
  connections?: number; // Количество активных подключений
  error?: string;
}

/**
 * Получить метрики PostgreSQL из Prometheus
 */
export async function getPostgresMetricsFromPrometheus(): Promise<PostgresMetrics> {
  const startTime = Date.now();
  
  try {
    // Проверяем доступность PostgreSQL через pg_up метрику
    const pgUp = await querySingleValue('pg_up');
    
    if (pgUp !== 1) {
      const responseTime = Date.now() - startTime;
      return {
        status: "error",
        responseTime,
        error: "PostgreSQL exporter reports database is down",
      };
    }

    // Получаем версию PostgreSQL
    // Пытаемся получить версию через различные метрики postgres_exporter
    let version: string | undefined;
    try {
      // Способ 1: через pg_stat_database_version (если доступно)
      const versionResult = await queryPrometheus('pg_stat_database_version');
      if (versionResult.length > 0) {
        version = versionResult[0].labels?.version || String(versionResult[0].value);
        // Извлекаем только номер версии (например, "14.19")
        const versionMatch = version.match(/(\d+\.\d+)/);
        if (versionMatch) {
          version = versionMatch[1];
        }
      }
    } catch {
      // Если не удалось, версия останется undefined
      version = undefined;
    }

    // Получаем количество активных подключений
    let connections: number | undefined;
    try {
      // Суммируем все подключения по всем базам данных
      connections = await querySingleValue('sum(pg_stat_database_numbackends)');
    } catch {
      connections = undefined;
    }

    // Получаем размер БД (сумма по всем базам)
    let databaseSize: number | undefined;
    try {
      databaseSize = await querySingleValue('sum(pg_database_size_bytes)');
    } catch {
      databaseSize = undefined;
    }

    // Получаем cache hit ratio (критично для производительности)
    let cacheHitRatio: number | undefined;
    try {
      // Используем текущие значения, а не rate (так как это счетчики)
      const cacheHits = await querySingleValue('sum(pg_stat_database_blks_hit)');
      const cacheReads = await querySingleValue('sum(pg_stat_database_blks_read)');
      const total = cacheHits + cacheReads;
      if (total > 0) {
        cacheHitRatio = (cacheHits / total) * 100;
      }
    } catch {
      // Пробуем альтернативный способ через rate
      try {
        const cacheHits = await querySingleValue('sum(rate(pg_stat_database_blks_hit[5m]))');
        const cacheReads = await querySingleValue('sum(rate(pg_stat_database_blks_read[5m]))');
        const total = cacheHits + cacheReads;
        if (total > 0) {
          cacheHitRatio = (cacheHits / total) * 100;
        }
      } catch {
        cacheHitRatio = undefined;
      }
    }

    // Получаем статистику транзакций
    let transactions: { commits?: number; rollbacks?: number } | undefined;
    try {
      const [commits, rollbacks] = await Promise.all([
        querySingleValue('sum(rate(pg_stat_database_xact_commit[5m]))').catch(() => 0),
        querySingleValue('sum(rate(pg_stat_database_xact_rollback[5m]))').catch(() => 0),
      ]);
      if (commits > 0 || rollbacks > 0) {
        transactions = {
          commits: Math.round(commits),
          rollbacks: Math.round(rollbacks),
        };
      }
    } catch {
      transactions = undefined;
    }

    // Получаем статистику запросов
    let queries: { selects?: number; inserts?: number; updates?: number; deletes?: number } | undefined;
    try {
      const [selects, inserts, updates, deletes] = await Promise.all([
        querySingleValue('sum(rate(pg_stat_database_tup_fetched[5m]))').catch(() => 0),
        querySingleValue('sum(rate(pg_stat_database_tup_inserted[5m]))').catch(() => 0),
        querySingleValue('sum(rate(pg_stat_database_tup_updated[5m]))').catch(() => 0),
        querySingleValue('sum(rate(pg_stat_database_tup_deleted[5m]))').catch(() => 0),
      ]);
      if (selects > 0 || inserts > 0 || updates > 0 || deletes > 0) {
        queries = {
          selects: Math.round(selects),
          inserts: Math.round(inserts),
          updates: Math.round(updates),
          deletes: Math.round(deletes),
        };
      }
    } catch {
      queries = undefined;
    }

    // Получаем количество deadlocks
    let deadlocks: number | undefined;
    try {
      deadlocks = await querySingleValue('sum(rate(pg_stat_database_deadlocks[5m]))');
      deadlocks = Math.round(deadlocks);
    } catch {
      deadlocks = undefined;
    }

    // Получаем количество ожидающих запросов
    let waitingQueries: number | undefined;
    try {
      waitingQueries = await querySingleValue('count(pg_stat_activity{state="waiting"})');
      waitingQueries = Math.round(waitingQueries);
    } catch {
      waitingQueries = undefined;
    }

    const responseTime = Date.now() - startTime;

    return {
      status: "online",
      responseTime,
      version,
      connections: connections ? Math.round(connections) : undefined,
      databaseSize,
      cacheHitRatio: cacheHitRatio !== undefined ? Math.round(cacheHitRatio * 100) / 100 : undefined,
      transactions,
      queries,
      deadlocks,
      waitingQueries,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: "error",
      responseTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Получить метрики Redis из Prometheus
 */
export async function getRedisMetricsFromPrometheus(): Promise<RedisMetrics> {
  const startTime = Date.now();
  
  try {
    // Проверяем доступность Redis через redis_up метрику
    const redisUp = await querySingleValue('redis_up');
    
    if (redisUp !== 1) {
      const responseTime = Date.now() - startTime;
      return {
        status: "error",
        responseTime,
        error: "Redis exporter reports Redis is down",
      };
    }

    // Получаем версию Redis
    let version: string | undefined;
    try {
      const versionResult = await queryPrometheus('redis_info_redis_version');
      if (versionResult.length > 0) {
        version = String(versionResult[0].value);
      }
    } catch {
      version = undefined;
    }

    // Получаем метрики памяти (критично для масштабирования)
    let memory: { used?: number; max?: number; percentage?: number } | undefined;
    try {
      const [used, max] = await Promise.all([
        querySingleValue('redis_memory_used_bytes').catch(() => undefined),
        querySingleValue('redis_memory_max_bytes').catch(() => undefined),
      ]);
      if (used !== undefined) {
        memory = {
          used: Math.round(used),
          max: max !== undefined ? Math.round(max) : undefined,
          percentage:
            max !== undefined && max > 0 ? Math.round((used / max) * 100 * 100) / 100 : undefined,
        };
      }
    } catch {
      memory = undefined;
    }

    // Получаем статистику ключей
    let keys: { total?: number; expired?: number; evicted?: number } | undefined;
    try {
      const [total, expired, evicted] = await Promise.all([
        querySingleValue('sum(redis_keyspace_keys)').catch(() => undefined),
        // expired может быть как rate, так и просто значение
        querySingleValue('sum(rate(redis_keyspace_keys_expired[5m]))').catch(() =>
          querySingleValue('sum(redis_keyspace_keys_expired)').catch(() => undefined)
        ),
        querySingleValue('redis_evicted_keys_total').catch(() => undefined),
      ]);
      if (total !== undefined || expired !== undefined || evicted !== undefined) {
        keys = {
          total: total !== undefined ? Math.round(total) : undefined,
          expired: expired !== undefined ? Math.round(expired) : undefined,
          evicted: evicted !== undefined ? Math.round(evicted) : undefined,
        };
      }
    } catch {
      keys = undefined;
    }

    // Получаем статистику кэша (hit/miss ratio)
    let cache: { hits?: number; misses?: number; hitRatio?: number } | undefined;
    try {
      const [hits, misses] = await Promise.all([
        querySingleValue('sum(rate(redis_keyspace_hits[5m]))').catch(() => 0),
        querySingleValue('sum(rate(redis_keyspace_misses[5m]))').catch(() => 0),
      ]);
      const total = hits + misses;
      if (total > 0) {
        cache = {
          hits: Math.round(hits),
          misses: Math.round(misses),
          hitRatio: Math.round((hits / total) * 100 * 100) / 100,
        };
      }
    } catch {
      cache = undefined;
    }

    // Получаем статистику команд
    let commands: { processed?: number; perSecond?: number } | undefined;
    try {
      const processed = await querySingleValue('sum(rate(redis_commands_processed_total[5m]))');
      commands = {
        processed: Math.round(processed),
        perSecond: Math.round(processed),
      };
    } catch {
      commands = undefined;
    }

    // Получаем количество подключений
    let connections: number | undefined;
    try {
      connections = await querySingleValue('redis_connected_clients');
      connections = Math.round(connections);
    } catch {
      connections = undefined;
    }

    const responseTime = Date.now() - startTime;

    return {
      status: "online",
      responseTime,
      version,
      memory,
      keys,
      cache,
      commands,
      connections,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: "error",
      responseTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Интерфейс для метрик сервиса
 */
export interface ServiceMetrics {
  status: "online" | "offline" | "error";
  responseTime: number;
  httpStatusCode?: number;
  error?: string;
}

/**
 * Получить статус сервиса из Prometheus через blackbox_exporter
 */
export async function getServiceMetricsFromPrometheus(
  serviceName: string,
  instanceUrl: string
): Promise<ServiceMetrics> {
  const startTime = Date.now();
  
  try {
    // Определяем service label на основе имени сервиса
    const serviceLabelMap: Record<string, string> = {
      "Web App": "web-app",
      "Trainer Panel": "trainer-panel",
      "Admin Panel": "admin-panel",
      "Bull Board": "bull-board",
    };
    
    const serviceLabel = serviceLabelMap[serviceName] || serviceName.toLowerCase().replace(/\s+/g, "-");
    
    // Сначала пытаемся найти по service label (более надежно)
    let successQuery = `probe_success{job="services-health",service="${serviceLabel}"}`;
    let successResult = await queryPrometheus(successQuery);
    
    // Если не нашли по service label, пытаемся по instance URL
    if (successResult.length === 0) {
      // Нормализуем URL для поиска (убираем протокол и порт для более гибкого поиска)
      const urlParts = instanceUrl.replace(/^https?:\/\//, "").split("/");
      const hostPort = urlParts[0];
      
      // Пробуем найти по части URL
      successQuery = `probe_success{job="services-health",instance=~".*${hostPort}.*"}`;
      successResult = await queryPrometheus(successQuery);
    }
    
    // Если все еще не нашли, пробуем точное совпадение instance
    if (successResult.length === 0) {
      successQuery = `probe_success{job="services-health",instance="${instanceUrl}"}`;
      successResult = await queryPrometheus(successQuery);
    }
    
    if (successResult.length === 0) {
      const responseTime = Date.now() - startTime;
      // Пробуем получить все доступные метрики для диагностики
      const allServices = await queryPrometheus('probe_success{job="services-health"}');
      const availableServices = allServices.map(r => ({
        service: r.labels?.service || "unknown",
        instance: r.labels?.instance || "unknown",
      }));
      
      return {
        status: "error",
        responseTime,
        error: `Service ${serviceName} (${serviceLabel}) not found in Prometheus metrics. Available: ${JSON.stringify(availableServices)}`,
      };
    }
    
    const isOnline = successResult[0].value === 1;

    // Получаем HTTP статус код, если доступен
    let httpStatusCode: number | undefined;
    try {
      const statusCodeQuery = `probe_http_status_code{job="services-health",service="${serviceLabel}"}`;
      const statusCodeResult = await queryPrometheus(statusCodeQuery);
      if (statusCodeResult.length > 0) {
        httpStatusCode = Math.round(statusCodeResult[0].value);
      }
    } catch {
      // HTTP статус код не критичен
    }

    // Получаем время ответа из метрики (более точное)
    let probeResponseTime: number | undefined;
    try {
      const durationQuery = `probe_http_duration_seconds{job="services-health",service="${serviceLabel}"}`;
      const durationResult = await queryPrometheus(durationQuery);
      if (durationResult.length > 0) {
        probeResponseTime = Math.round(durationResult[0].value * 1000); // конвертируем в миллисекунды
      }
    } catch {
      // Используем время запроса к Prometheus
    }
    
    const responseTime = probeResponseTime || (Date.now() - startTime);

    return {
      status: isOnline ? "online" : "offline",
      responseTime: probeResponseTime || responseTime,
      httpStatusCode,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: "error",
      responseTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}


/**
 * Интерфейс для метрик очереди BullMQ
 */
export interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused?: boolean;
  // Дополнительные метрики
  throughput?: number; // Задач в секунду
  averageDuration?: number; // Среднее время обработки в секундах
  errorRate?: number; // Процент ошибок (0-100)
}

/**
 * Получить метрики очередей BullMQ из Prometheus
 */
export async function getQueuesMetricsFromPrometheus(): Promise<QueueMetrics[]> {
  try {
    const queues = ["push", "reengagement", "exam-cleanup"];
    const queueMetrics: QueueMetrics[] = [];

    for (const queueName of queues) {
      try {
        // Получаем размеры очередей по состояниям
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          querySingleValue(`bullmq_job_count{queue="${queueName}",state="waiting"}`).catch(() => 0),
          querySingleValue(`bullmq_job_count{queue="${queueName}",state="active"}`).catch(() => 0),
          querySingleValue(`bullmq_job_count{queue="${queueName}",state="completed"}`).catch(() => 0),
          querySingleValue(`bullmq_job_count{queue="${queueName}",state="failed"}`).catch(() => 0),
          querySingleValue(`bullmq_job_count{queue="${queueName}",state="delayed"}`).catch(() => 0),
        ]);

        // Получаем throughput (задач в секунду) через rate
        let throughput: number | undefined;
        try {
          throughput = await querySingleValue(
            `sum(rate(bullmq_job_count{queue="${queueName}",state="completed"}[5m]))`
          );
        } catch {
          // Если не удалось получить rate, оставляем undefined
        }

        // Получаем среднее время обработки
        let averageDuration: number | undefined;
        try {
          averageDuration = await querySingleValue(`bullmq_job_duration_seconds{queue="${queueName}"}`);
        } catch {
          // Если не удалось получить, оставляем undefined
        }

        // Вычисляем error rate
        let errorRate: number | undefined;
        const total = completed + failed;
        if (total > 0) {
          errorRate = (failed / total) * 100;
        }

        queueMetrics.push({
          name: queueName,
          waiting: Math.round(waiting),
          active: Math.round(active),
          completed: Math.round(completed),
          failed: Math.round(failed),
          delayed: Math.round(delayed),
          throughput: throughput !== undefined ? Math.round(throughput * 100) / 100 : undefined,
          averageDuration: averageDuration !== undefined ? Math.round(averageDuration * 1000) / 1000 : undefined,
          errorRate: errorRate !== undefined ? Math.round(errorRate * 100) / 100 : undefined,
        });
      } catch {
        // Если не удалось получить метрики для очереди, добавляем с нулевыми значениями
        queueMetrics.push({
          name: queueName,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
        });
      }
    }

    return queueMetrics;
  } catch (error) {
    throw new Error(
      `Failed to get queues metrics from Prometheus: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}


/**
 * Экспорт функции для выполнения произвольных PromQL запросов
 */
/**
 * Интерфейс для метрик ошибок из Prometheus
 */
export interface ErrorMetricsFromPrometheus {
  total: number; // Общее количество ошибок
  byApp: { app: string; count: number }[]; // Ошибки по приложениям
  byType: { type: string; count: number }[]; // Ошибки по типам
  errorRate: number; // Количество ошибок в секунду за последние 5 минут
  byAppAndType: { app: string; type: string; count: number }[]; // Ошибки по приложениям и типам
}

/**
 * Получить метрики ошибок
 * @deprecated Prometheus метрики удалены. Используйте статистику из базы данных.
 */
export async function getErrorMetricsFromPrometheus(): Promise<ErrorMetricsFromPrometheus> {
  // Prometheus метрики удалены - возвращаем пустые данные
  return {
    total: 0,
    byApp: [],
    byType: [],
    errorRate: 0,
    byAppAndType: [],
  };
}

export { queryPrometheus, querySingleValue };

