/**
 * Пример использования @gafus/logger
 * 
 * Этот файл демонстрирует основные возможности единого логгера
 */

import {
  createWebLogger,
  createTrainerPanelLogger,
  createWorkerLogger,
  LoggerFactory,
  type Logger,
} from '@gafus/logger';

// Пример 1: Использование готовых логгеров для приложений
export function demonstrateAppLoggers() {
  // Логгер для веб-приложения
  const webLogger = createWebLogger('auth-module');
  
  webLogger.info('Пользователь вошел в систему', { userId: '123' });
  webLogger.success('Аутентификация прошла успешно');
  webLogger.warn('Попытка входа с необычного IP', { ip: '192.168.1.100' });
  
  // Логгер для панели тренера
  const trainerLogger = createTrainerPanelLogger('statistics');
  
  trainerLogger.info('Загрузка статистики курса', { courseId: 'course-123' });
  trainerLogger.debug('Детальная информация о статистике', { 
    totalUsers: 150,
    completedUsers: 120 
  });
  
  // Логгер для worker
  const workerLogger = createWorkerLogger('push-notifications');
  
  workerLogger.info('Отправка push-уведомления', { userId: '123', message: 'Новый урок доступен' });
}

// Пример 2: Создание кастомного логгера
export function demonstrateCustomLogger() {
  const customLogger = LoggerFactory.createLogger({
    appName: 'custom-service',
    context: 'user-management',
    environment: 'development',
    enableErrorDashboard: true,
    errorDashboardUrl: 'http://localhost:3001/api/push-logs',
  });
  
  customLogger.info('Создание пользователя', { email: 'user@example.com' });
  customLogger.success('Пользователь создан успешно', { userId: '456' });
}

// Пример 3: Обработка ошибок
export async function demonstrateErrorHandling() {
  const logger = createWebLogger('database');
  
  try {
    // Симуляция операции с базой данных
    throw new Error('Connection timeout');
  } catch (error) {
    // Эта ошибка будет отправлена в error-dashboard
    await logger.error('Ошибка подключения к базе данных', error as Error, {
      operation: 'user-creation',
      userId: '789',
    });
  }
}

// Пример 4: Логирование в серверных действиях
export async function demonstrateServerAction() {
  const logger = createWebLogger('server-actions');
  
  logger.info('Начало выполнения серверного действия', { 
    action: 'updateUserProfile',
    userId: '123' 
  });
  
  try {
    // Симуляция работы
    await new Promise(resolve => setTimeout(resolve, 100));
    
    logger.success('Профиль пользователя обновлен', { userId: '123' });
  } catch (error) {
    await logger.error('Ошибка обновления профиля', error as Error, { userId: '123' });
    throw error;
  }
}

// Пример 5: Логирование в middleware
export function demonstrateMiddleware() {
  const logger = createWebLogger('middleware');
  
  logger.debug('Проверка аутентификации', { 
    path: '/api/protected',
    method: 'GET' 
  });
  
  logger.info('Middleware выполнен успешно');
}

// Пример 6: Логирование только в development
export function demonstrateDevLogging() {
  const logger = createWebLogger('debug-module');
  
  // Этот лог появится только в development
  logger.dev('Отладочная информация', { 
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime() 
  });
}

// Пример 7: Структурированное логирование
export function demonstrateStructuredLogging() {
  const logger = createWebLogger('analytics');
  
  logger.info('Аналитика пользователя', {
    userId: '123',
    sessionId: 'session-456',
    events: [
      { type: 'page_view', page: '/courses' },
      { type: 'click', element: 'start-course-button' },
    ],
    metadata: {
      userAgent: 'Mozilla/5.0...',
      timestamp: new Date().toISOString(),
    },
  });
}

// Пример 8: Использование в классе
export class UserService {
  private logger: Logger;
  
  constructor() {
    this.logger = createWebLogger('user-service');
  }
  
  async createUser(userData: { email: string; name: string }) {
    this.logger.info('Создание пользователя', { email: userData.email });
    
    try {
      // Симуляция создания пользователя
      const user = { id: '123', ...userData };
      
      this.logger.success('Пользователь создан', { userId: user.id });
      return user;
    } catch (error) {
      await this.logger.error('Ошибка создания пользователя', error as Error, { 
        email: userData.email 
      });
      throw error;
    }
  }
}

// Пример 9: Конфигурация по окружению
export function demonstrateEnvironmentConfig() {
  // В development: debug уровень, цветной вывод
  // В production: warn уровень, JSON формат, отправка в error-dashboard
  const logger = LoggerFactory.createLogger({
    appName: 'environment-demo',
    environment: process.env.NODE_ENV as 'development' | 'production' | 'test',
  });
  
  logger.debug('Этот лог появится только в development');
  logger.warn('Этот лог появится во всех окружениях');
}

// Пример 10: Кэширование логгеров
export function demonstrateLoggerCaching() {
  // Первый вызов создает логгер
  const logger1 = LoggerFactory.createLoggerWithContext('my-app', 'module-1');
  
  // Второй вызов возвращает тот же экземпляр (кэшированный)
  const logger2 = LoggerFactory.createLoggerWithContext('my-app', 'module-1');
  
  // logger1 === logger2; // true
  
  // Очистка кэша
  LoggerFactory.clearCache();
}
