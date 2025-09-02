import { useOfflineStore } from "@shared/stores/offlineStore";

/**
 * Хук для получения статуса offline состояния
 */
export function useOfflineStatus() {
  const { isOnline, isStable, isActuallyConnected, connectionQuality, networkMetrics } = useOfflineStore();

  // В dev режиме делаем более мягкую проверку
  const isDevMode = process.env.NODE_ENV === "development";

  // Определяем реальный статус
  const realOnline = isOnline && isActuallyConnected;
  const realOffline = !isOnline || !isActuallyConnected;

  // Определяем цвет статуса на основе качества соединения
  const getStatusColor = () => {
    if (realOffline) return "red";
    
    switch (connectionQuality) {
      case 'excellent':
      case 'good':
        return "green";
      case 'fair':
        return "yellow";
      case 'poor':
        return "orange";
      case 'offline':
        return "red";
      default:
        return isStable ? "green" : "yellow";
    }
  };

  const statusColor = getStatusColor();

  // Определяем иконку на основе статуса
  const getStatusIcon = () => {
    switch (statusColor) {
      case "green": return "🟢";
      case "yellow": return "🟡";
      case "orange": return "🟠";
      case "red": return "🔴";
      default: return "⚪";
    }
  };

  // Определяем текст статуса
  const getStatusText = () => {
    if (realOffline) return "Офлайн";
    
    switch (connectionQuality) {
      case 'excellent': return "Отлично";
      case 'good': return "Онлайн";
      case 'fair': return "Медленно";
      case 'poor': return "Плохо";
      case 'offline': return "Офлайн";
      default: return isStable ? "Онлайн" : "Нестабильно";
    }
  };

  // Определяем детальный статус
  const getDetailedStatus = () => {
    if (realOffline) return "Нет сети";
    
    if (isOnline && !isActuallyConnected) {
      return isDevMode ? "Сеть есть, проверяется соединение..." : "Сеть есть, но не работает";
    }
    
    switch (connectionQuality) {
      case 'excellent': return `Отличное соединение (${networkMetrics.latency}ms)`;
      case 'good': return `Хорошее соединение (${networkMetrics.latency}ms)`;
      case 'fair': return `Медленное соединение (${networkMetrics.latency}ms)`;
      case 'poor': return `Плохое соединение (${networkMetrics.latency}ms)`;
      default: return "Работает нормально";
    }
  };

  return {
    isOnline: realOnline,
    isOffline: realOffline,
    isStable,
    isUnstable: !isStable,

    // Дополнительная информация
    browserOnline: isOnline, // Что говорит браузер
    actuallyConnected: isActuallyConnected, // Реальное соединение
    connectionQuality, // Качество соединения
    networkMetrics, // Метрики сети

    // Статус для UI
    status: realOnline ? (isStable ? "online" : "unstable") : "offline",

    // Цвет для индикатора
    statusColor,

    // Иконка для индикатора
    statusIcon: getStatusIcon(),

    // Текст для отображения
    statusText: getStatusText(),

    // Детальная информация
    detailedStatus: getDetailedStatus(),
  };
}
