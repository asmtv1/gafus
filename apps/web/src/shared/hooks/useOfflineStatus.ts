import { useOfflineStore } from "@shared/stores/offlineStore";

/**
 * Хук для получения статуса offline состояния
 */
export function useOfflineStatus() {
  const { isOnline, isStable, isActuallyConnected } = useOfflineStore();

  // В dev режиме делаем более мягкую проверку
  const isDevMode = process.env.NODE_ENV === "development";

  // Определяем реальный статус
  const realOnline = isOnline && isActuallyConnected;
  const realOffline = !isOnline || !isActuallyConnected;

  // В dev режиме, если браузер показывает онлайн, но реальное соединение не проверено,
  // показываем желтый статус вместо красного
  const devStatusColor =
    isDevMode && isOnline && !isActuallyConnected
      ? "yellow"
      : realOnline
        ? isStable
          ? "green"
          : "yellow"
        : "red";

  return {
    isOnline: realOnline,
    isOffline: realOffline,
    isStable,
    isUnstable: !isStable,

    // Дополнительная информация
    browserOnline: isOnline, // Что говорит браузер
    actuallyConnected: isActuallyConnected, // Реальное соединение

    // Статус для UI
    status: realOnline ? (isStable ? "online" : "unstable") : "offline",

    // Цвет для индикатора
    statusColor: devStatusColor,

    // Иконка для индикатора
    statusIcon: devStatusColor === "green" ? "🟢" : devStatusColor === "yellow" ? "🟡" : "🔴",

    // Текст для отображения
    statusText:
      devStatusColor === "green"
        ? "Онлайн"
        : devStatusColor === "yellow"
          ? isDevMode && isOnline && !isActuallyConnected
            ? "Проверяется..."
            : "Нестабильно"
          : "Офлайн",

    // Детальная информация
    detailedStatus:
      isOnline && !isActuallyConnected
        ? isDevMode
          ? "Сеть есть, проверяется соединение..."
          : "Сеть есть, но не работает"
        : !isOnline
          ? "Нет сети"
          : "Работает нормально",
  };
}
