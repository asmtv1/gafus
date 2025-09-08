"use client";

import { useState, useEffect } from "react";
import { 
  isOnline, 
  getSyncQueueStatus, 
  clearSyncQueue,
  syncOfflineQueue 
} from "@shared/utils/offlineCacheUtils";
import { useOfflineStore } from "@shared/stores/offlineStore";

/**
 * Компонент для тестирования офлайн режима и кэширования
 * Доступен только в development режиме
 */
export default function OfflineCacheTester() {
  const [isVisible, setIsVisible] = useState(false);
  const [queueStatus, setQueueStatus] = useState(getSyncQueueStatus());
  const { isOnline: storeIsOnline, syncQueue } = useOfflineStore();

  // Показываем компонент только в development режиме
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      setIsVisible(true);
    }
  }, []);

  // Обновляем статус очереди каждые 2 секунды
  useEffect(() => {
    const interval = setInterval(() => {
      setQueueStatus(getSyncQueueStatus());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleClearQueue = () => {
    clearSyncQueue();
    setQueueStatus(getSyncQueueStatus());
  };

  const handleSyncQueue = async () => {
    try {
      await syncOfflineQueue();
      setQueueStatus(getSyncQueueStatus());
    } catch (error) {
      console.error("Failed to sync queue:", error);
    }
  };

  const handleTestCacheInvalidation = async () => {
    try {
      const { safeInvalidateCache } = await import("@shared/lib/actions/invalidateCoursesCache");
      const result = await safeInvalidateCache("test-user", {
        includeUserProgress: true,
        force: false
      });
      console.log("Cache invalidation test result:", result);
    } catch (error) {
      console.error("Cache invalidation test failed:", error);
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div style={{
      position: "fixed",
      top: "10px",
      right: "10px",
      background: "#1a1a1a",
      color: "#fff",
      padding: "10px",
      borderRadius: "8px",
      fontSize: "12px",
      fontFamily: "monospace",
      zIndex: 9999,
      maxWidth: "300px",
      border: "1px solid #333"
    }}>
      <div style={{ marginBottom: "8px", fontWeight: "bold" }}>
        🔧 Offline Cache Tester
      </div>
      
      <div style={{ marginBottom: "4px" }}>
        <span style={{ color: isOnline() ? "#4ade80" : "#f87171" }}>
          ●
        </span>
        {" "}Online: {isOnline() ? "Yes" : "No"}
      </div>
      
      <div style={{ marginBottom: "4px" }}>
        <span style={{ color: storeIsOnline ? "#4ade80" : "#f87171" }}>
          ●
        </span>
        {" "}Store Online: {storeIsOnline ? "Yes" : "No"}
      </div>
      
      <div style={{ marginBottom: "4px" }}>
        Queue: {queueStatus.queueLength} actions
      </div>
      
      {queueStatus.lastSyncTime && (
        <div style={{ marginBottom: "4px", fontSize: "10px", color: "#888" }}>
          Last sync: {new Date(queueStatus.lastSyncTime).toLocaleTimeString()}
        </div>
      )}
      
      {queueStatus.syncErrors.length > 0 && (
        <div style={{ marginBottom: "4px", color: "#f87171" }}>
          Errors: {queueStatus.syncErrors.length}
        </div>
      )}
      
      <div style={{ display: "flex", gap: "4px", marginTop: "8px" }}>
        <button
          onClick={handleClearQueue}
          style={{
            background: "#dc2626",
            color: "white",
            border: "none",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "10px",
            cursor: "pointer"
          }}
        >
          Clear
        </button>
        
        <button
          onClick={handleSyncQueue}
          disabled={!isOnline() || queueStatus.queueLength === 0}
          style={{
            background: isOnline() && queueStatus.queueLength > 0 ? "#059669" : "#6b7280",
            color: "white",
            border: "none",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "10px",
            cursor: isOnline() && queueStatus.queueLength > 0 ? "pointer" : "not-allowed"
          }}
        >
          Sync
        </button>
        
        <button
          onClick={handleTestCacheInvalidation}
          style={{
            background: "#7c3aed",
            color: "white",
            border: "none",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "10px",
            cursor: "pointer"
          }}
        >
          Test Cache
        </button>
      </div>
      
      <div style={{ marginTop: "8px", fontSize: "10px", color: "#888" }}>
        {syncQueue.length > 0 && (
          <div>
            Actions in queue:
            {syncQueue.slice(0, 3).map((action, index) => (
              <div key={index} style={{ marginLeft: "8px" }}>
                • {action.type}
              </div>
            ))}
            {syncQueue.length > 3 && (
              <div style={{ marginLeft: "8px" }}>
                ... and {syncQueue.length - 3} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
