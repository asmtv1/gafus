"use client";

import { useAchievementsMutation } from "@shared/hooks/useAchievements";

import styles from "./AchievementsError.module.css";

interface AchievementsErrorProps {
  error: Error;
  onRetry?: () => void;
}

/**
 * Компонент для отображения ошибок загрузки достижений
 * Предоставляет возможность повторной попытки загрузки
 */
export function AchievementsError({ error, onRetry }: AchievementsErrorProps) {
  const { invalidateAchievements } = useAchievementsMutation();
  
  const handleRetry = () => {
    invalidateAchievements();
    onRetry?.();
  };
  
  return (
    <div className={styles.container}>
      <div className={styles.errorIcon}>⚠️</div>
      
      <div className={styles.errorContent}>
        <h3 className={styles.errorTitle}>Ошибка загрузки достижений</h3>
        
        <p className={styles.errorMessage}>
          {getErrorMessage(error)}
        </p>
        
        <div className={styles.errorActions}>
          <button 
            className={styles.retryButton}
            onClick={handleRetry}
            type="button"
          >
            Попробовать снова
          </button>
          
          <button 
            className={styles.refreshButton}
            onClick={() => window.location.reload()}
            type="button"
          >
            Обновить страницу
          </button>
        </div>
      </div>
      
      <div className={styles.errorDetails}>
        <details>
          <summary className={styles.detailsSummary}>
            Техническая информация
          </summary>
          <div className={styles.detailsContent}>
            <p><strong>Ошибка:</strong> {error.message}</p>
            <p><strong>Время:</strong> {new Date().toLocaleString()}</p>
            {error.stack && (
              <pre className={styles.errorStack}>
                {error.stack}
              </pre>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}

/**
 * Компактный компонент ошибки для небольших компонентов
 */
export function AchievementsErrorCompact({ error, onRetry }: AchievementsErrorProps) {
  const { invalidateAchievements } = useAchievementsMutation();
  
  const handleRetry = () => {
    invalidateAchievements();
    onRetry?.();
  };
  
  return (
    <div className={styles.compactContainer}>
      <div className={styles.compactIcon}>⚠️</div>
      
      <div className={styles.compactContent}>
        <p className={styles.compactMessage}>
          {getErrorMessage(error)}
        </p>
        
        <button 
          className={styles.compactRetryButton}
          onClick={handleRetry}
          type="button"
        >
          Повторить
        </button>
      </div>
    </div>
  );
}

/**
 * Получает понятное сообщение об ошибке
 */
function getErrorMessage(error: Error): string {
  if (error.message.includes("Пользователь не найден")) {
    return "Для просмотра достижений необходимо войти в систему.";
  }
  
  if (error.message.includes("network") || error.message.includes("fetch")) {
    return "Проблема с подключением к интернету. Проверьте соединение и попробуйте снова.";
  }
  
  if (error.message.includes("timeout")) {
    return "Превышено время ожидания. Сервер не отвечает.";
  }
  
  if (error.message.includes("500") || error.message.includes("Internal Server Error")) {
    return "Временная проблема на сервере. Попробуйте позже.";
  }
  
  if (error.message.includes("404")) {
    return "Достижения не найдены. Возможно, данные еще не созданы.";
  }
  
  if (error.message.includes("403") || error.message.includes("Unauthorized")) {
    return "Недостаточно прав для просмотра достижений.";
  }
  
  // Общее сообщение для неизвестных ошибок
  return "Произошла неожиданная ошибка при загрузке достижений. Попробуйте обновить страницу.";
}
