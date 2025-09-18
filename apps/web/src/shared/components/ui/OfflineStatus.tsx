"use client";

import { useOfflineStatus } from "@shared/hooks/useOfflineStatus";
import { useSyncQueue } from "@shared/hooks/useSyncQueue";
import { useEffect, useState } from "react";

export default function OfflineStatus() {
  const { 
    isOnline,
    statusIcon, 
    statusText, 
    statusColor, 
    detailedStatus
  } = useOfflineStatus();
  const { queueLength, hasPendingActions, lastSyncDate, formatLastSync, syncOfflineActions } =
    useSyncQueue();
  const [showDetails, setShowDetails] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Автоматически скрываем детали через 5 секунд
  useEffect(() => {
    if (showDetails) {
      const timer = setTimeout(() => setShowDetails(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showDetails]);

  // Функция принудительной синхронизации
  const handleForceCheck = async () => {
    setIsChecking(true);
    try {
      // Принудительная синхронизация очереди
      await syncOfflineActions();
    } catch (error) {
      console.warn("Force sync failed:", error);
    } finally {
      setIsChecking(false);
    }
  };

  // Если нет pending действий и мы онлайн, не показываем компонент
  if (!hasPendingActions && isOnline) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: "5px",
        left: "50%",
        transform: "translateX(-42%)",
        background: statusColor === "green" ? "#d4edda" : "#f8d7da",
        border: `1px solid ${statusColor === "green" ? "#c3e6cb" : "#f5c6cb"}`,
        borderRadius: "8px",
        padding: "12px",
        minWidth: "200px",
        maxWidth: "300px",
        zIndex: 1000,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        cursor: "pointer",
        transition: "all 0.3s ease",
      }}
      onClick={() => setShowDetails(!showDetails)}
    >
      {/* Основной статус */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{ fontSize: "18px" }}>{statusIcon}</span>
        <span style={{ fontWeight: "bold" }}>{statusText}</span>
        {process.env.NODE_ENV === "development" && (
          <span style={{ fontSize: "10px", color: "#ffc107", fontWeight: "bold" }}>DEV</span>
        )}

        {hasPendingActions && (
          <span
            style={{
              background: "#dc3545",
              color: "white",
              borderRadius: "12px",
              padding: "2px 8px",
              fontSize: "10px",
              fontWeight: "bold",
            }}
          >
            {queueLength}
          </span>
        )}
      </div>

      {/* Детали (показываются при клике) */}
      {showDetails && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: "8px" }}>
          {/* Детальный статус соединения */}
          <div style={{ marginBottom: "8px" }}>
            <strong>Соединение:</strong> {detailedStatus}
          </div>

          {/* Детали сети */}
          <div style={{ marginBottom: "8px", fontSize: "12px", opacity: 0.8 }}>
            Статус: {detailedStatus}
            {process.env.NODE_ENV === "development" && (
              <>
                <br />
                <span style={{ color: "#ffc107" }}>🔧 Dev режим</span>
              </>
            )}
          </div>

          {/* Статус синхронизации */}
          <div style={{ marginBottom: "8px" }}>
            <strong>Синхронизация:</strong>
            {hasPendingActions ? (
              <span style={{ color: "#dc3545" }}> {queueLength} действий ожидают</span>
            ) : (
              <span style={{ color: "#28a745" }}> Все синхронизировано</span>
            )}
          </div>

          {/* Время последней синхронизации */}
          {lastSyncDate && (
            <div style={{ marginBottom: "8px" }}>
              <strong>Последняя синхронизация:</strong> {formatLastSync()}
            </div>
          )}

          {/* Кнопка принудительной синхронизации */}
          {hasPendingActions && (
            <div style={{ marginTop: "12px" }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleForceCheck();
                }}
                disabled={isChecking}
                style={{
                  background: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  cursor: isChecking ? "not-allowed" : "pointer",
                  opacity: isChecking ? 0.6 : 1,
                }}
              >
                {isChecking ? "Синхронизация..." : "Синхронизировать"}
              </button>
            </div>
          )}

          {/* Debug информация для dev режима */}
          {process.env.NODE_ENV === "development" && (
            <div
              style={{
                marginTop: "12px",
                padding: "8px",
                background: "#f8f9fa",
                border: "1px solid #dee2e6",
                borderRadius: "4px",
                fontSize: "10px",
                fontFamily: "monospace",
              }}
            >
              <strong>Debug Info:</strong>
              <br />
              • Store isOnline: {isOnline ? "true" : "false"}
              <br />
              • Queue length: {queueLength}
              <br />
              • Last sync: {lastSyncDate ? formatLastSync() : "Never"}
              <br />
              • Has pending: {hasPendingActions ? "true" : "false"}
              <br />
              • Status color: {statusColor}
              <br />
              • Detailed status: {detailedStatus}
            </div>
          )}
        </div>
      )}

      {/* Индикатор клика */}
      <div
        style={{
          position: "absolute",
          top: "4px",
          right: "4px",
          fontSize: "10px",
          opacity: 0.5,
        }}
      >
        {showDetails ? "▲" : "▼"}
      </div>
    </div>
  );
}