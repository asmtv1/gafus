import { useOfflineStore } from "@shared/stores/offlineStore";

/**
 * Хук для работы с очередью синхронизации
 */
export function useSyncQueue() {
  const {
    syncQueue,
    lastSyncTime,
    syncErrors,
    addToSyncQueue,
    removeFromSyncQueue,
    clearSyncQueue,
    syncOfflineActions,
  } = useOfflineStore();

  return {
    // Данные
    syncQueue,
    lastSyncTime,
    syncErrors,

    // Статистика
    queueLength: syncQueue.length,
    hasPendingActions: syncQueue.length > 0,
    lastSyncDate: lastSyncTime ? new Date(lastSyncTime) : null,

    // Действия
    addToSyncQueue,
    removeFromSyncQueue,
    clearSyncQueue,
    syncOfflineActions,

    // Утилиты
    getActionCount: (type: string) =>
      syncQueue.filter((action: { type: string }) => action.type === type).length,
    getRetryCount: (actionId: string) =>
      syncQueue.find((action) => action.id === actionId)?.retryCount || 0,

    // Форматирование времени
    formatLastSync: () => {
      if (!lastSyncTime) return "Никогда";

      const now = Date.now();
      const diff = now - lastSyncTime;

      if (diff < 60000) return "Только что";
      if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
      return new Date(lastSyncTime).toLocaleDateString("ru-RU");
    },
  };
}
