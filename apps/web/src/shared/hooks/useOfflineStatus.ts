import { useOfflineStore } from "@shared/stores/offlineStore";

/**
 * Упрощенный хук для получения статуса offline состояния
 * Основан только на navigator.onLine
 */
export function useOfflineStatus() {
  const { isOnline } = useOfflineStore();

  // Определяем цвет статуса
  const getStatusColor = () => {
    return isOnline ? "green" : "red";
  };

  const statusColor = getStatusColor();

  // Определяем иконку на основе статуса
  const getStatusIcon = () => {
    return isOnline ? "🟢" : "🔴";
  };

  // Определяем текст статуса
  const getStatusText = () => {
    return isOnline ? "Онлайн" : "Офлайн";
  };

  // Определяем детальный статус
  const getDetailedStatus = () => {
    if (isOnline) {
      return "Подключение к интернету активно";
    }
    return "Нет подключения к интернету";
  };

  return {
    isOnline,
    isOffline: !isOnline,
    statusColor,
    statusIcon: getStatusIcon(),
    statusText: getStatusText(),
    detailedStatus: getDetailedStatus(),
  };
}
