/**
 * Утилиты для тестирования offline механизма
 * Используется только в development режиме
 */

import { useOfflineStore } from "@shared/stores/offlineStore";

export class OfflineTester {
  private static instance: OfflineTester;
  
  static getInstance(): OfflineTester {
    if (!OfflineTester.instance) {
      OfflineTester.instance = new OfflineTester();
    }
    return OfflineTester.instance;
  }

  /**
   * Симулирует потерю соединения
   */
  simulateOffline(): void {
    if (process.env.NODE_ENV !== "development") {
      console.warn("OfflineTester: Available only in development mode");
      return;
    }

    console.warn("🧪 OfflineTester: Simulating offline state");
    useOfflineStore.getState().setOnlineStatus(false);
  }

  /**
   * Симулирует восстановление соединения
   */
  simulateOnline(): void {
    if (process.env.NODE_ENV !== "development") {
      console.warn("OfflineTester: Available only in development mode");
      return;
    }

    console.warn("🧪 OfflineTester: Simulating online state");
    useOfflineStore.getState().setOnlineStatus(true);
  }

  /**
   * Симулирует медленное соединение
   */
  simulateSlowConnection(): void {
    if (process.env.NODE_ENV !== "development") {
      console.warn("OfflineTester: Available only in development mode");
      return;
    }

    console.warn("🧪 OfflineTester: Simulating slow connection");
    useOfflineStore.getState().setConnectionQuality('poor');
  }

  /**
   * Симулирует нестабильное соединение
   */
  simulateUnstableConnection(): void {
    if (process.env.NODE_ENV !== "development") {
      console.warn("OfflineTester: Available only in development mode");
      return;
    }

    console.warn("🧪 OfflineTester: Simulating unstable connection");
    useOfflineStore.getState().setNetworkStability(false);
  }

  /**
   * Добавляет тестовое действие в очередь синхронизации
   */
  addTestAction(): void {
    if (process.env.NODE_ENV !== "development") {
      console.warn("OfflineTester: Available only in development mode");
      return;
    }

    console.warn("🧪 OfflineTester: Adding test action to sync queue");
    useOfflineStore.getState().addToSyncQueue({
      type: "step-completion",
      data: {
        stepId: "test-step-" + Date.now(),
        courseId: "test-course",
        userId: "test-user",
        completedAt: new Date(),
      },
      maxRetries: 3,
    });
  }

  /**
   * Очищает очередь синхронизации
   */
  clearSyncQueue(): void {
    if (process.env.NODE_ENV !== "development") {
      console.warn("OfflineTester: Available only in development mode");
      return;
    }

    console.warn("🧪 OfflineTester: Clearing sync queue");
    useOfflineStore.getState().clearSyncQueue();
  }

  /**
   * Принудительно проверяет соединение
   */
  async forceConnectionCheck(): Promise<void> {
    if (process.env.NODE_ENV !== "development") {
      console.warn("OfflineTester: Available only in development mode");
      return;
    }

    console.warn("🧪 OfflineTester: Forcing connection check");
    await useOfflineStore.getState().checkExternalConnection();
  }

  /**
   * Принудительно проверяет качество соединения
   */
  async forceQualityCheck(): Promise<void> {
    if (process.env.NODE_ENV !== "development") {
      console.warn("OfflineTester: Available only in development mode");
      return;
    }

    console.warn("🧪 OfflineTester: Forcing quality check");
    await useOfflineStore.getState().checkConnectionQuality();
  }

  /**
   * Выводит текущее состояние в консоль
   */
  logCurrentState(): void {
    if (process.env.NODE_ENV !== "development") {
      console.warn("OfflineTester: Available only in development mode");
      return;
    }

    const state = useOfflineStore.getState();
    console.warn("🧪 OfflineTester: Current state:", {
      isOnline: state.isOnline,
      isActuallyConnected: state.isActuallyConnected,
      isStable: state.isStable,
      connectionQuality: state.connectionQuality,
      networkMetrics: state.networkMetrics,
      syncQueueLength: state.syncQueue.length,
      lastSyncAttempt: state.lastSyncAttempt,
    });
  }

  /**
   * Запускает полный тест offline механизма
   */
  async runFullTest(): Promise<void> {
    if (process.env.NODE_ENV !== "development") {
      console.warn("OfflineTester: Available only in development mode");
      return;
    }

    console.warn("🧪 OfflineTester: Starting full test...");
    
    // 1. Исходное состояние
    console.warn("🧪 Step 1: Initial state");
    this.logCurrentState();
    
    // 2. Добавляем тестовое действие
    console.warn("🧪 Step 2: Adding test action");
    this.addTestAction();
    
    // 3. Симулируем офлайн
    console.warn("🧪 Step 3: Simulating offline");
    this.simulateOffline();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 4. Симулируем онлайн
    console.warn("🧪 Step 4: Simulating online");
    this.simulateOnline();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 5. Проверяем качество соединения
    console.warn("🧪 Step 5: Checking connection quality");
    await this.forceQualityCheck();
    
    // 6. Финальное состояние
    console.warn("🧪 Step 6: Final state");
    this.logCurrentState();
    
    console.warn("🧪 OfflineTester: Full test completed!");
  }
}

// Экспортируем глобальный экземпляр для использования в консоли браузера
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as unknown as Record<string, unknown>).offlineTester = OfflineTester.getInstance();
  console.warn("🧪 OfflineTester: Available as window.offlineTester");
  console.warn("🧪 Available methods: simulateOffline(), simulateOnline(), addTestAction(), runFullTest(), logCurrentState()");
}
