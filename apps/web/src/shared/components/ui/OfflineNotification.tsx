"use client";

import { useOfflineStatus } from "@shared/hooks/useOfflineStatus";
import { useEffect, useState } from "react";

interface OfflineNotificationProps {
  message: string;
  type?: "info" | "warning" | "success" | "error";
  duration?: number;
  showOfflineIndicator?: boolean;
}

export default function OfflineNotification({
  message,
  type = "info",
  duration = 5000,
  showOfflineIndicator = true,
}: OfflineNotificationProps) {
  const { isOffline } = useOfflineStatus();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => setIsVisible(false), duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  if (!isVisible) return null;

  const getTypeStyles = () => {
    switch (type) {
      case "success":
        return { background: "#d4edda", border: "#c3e6cb", color: "#155724" };
      case "warning":
        return { background: "#fff3cd", border: "#ffeaa7", color: "#856404" };
      case "error":
        return { background: "#f8d7da", border: "#f5c6cb", color: "#721c24" };
      default:
        return { background: "#d1ecf1", border: "#bee5eb", color: "#0c5460" };
    }
  };

  const styles = getTypeStyles();

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        left: "20px",
        background: styles.background,
        border: `2px solid ${styles.border}`,
        borderRadius: "8px",
        padding: "16px",
        color: styles.color,
        fontSize: "14px",
        zIndex: 10001,
        maxWidth: "400px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}
    >
      {/* Иконка типа */}
      <span style={{ fontSize: "18px" }}>
        {type === "success" && "✅"}
        {type === "warning" && "⚠️"}
        {type === "error" && "❌"}
        {type === "info" && "ℹ️"}
      </span>

      {/* Сообщение */}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{message}</div>

        {/* Offline индикатор */}
        {showOfflineIndicator && isOffline && (
          <div style={{ fontSize: "12px", opacity: 0.8 }}>🔴 Работаем в offline режиме</div>
        )}
      </div>

      {/* Кнопка закрытия */}
      <button
        onClick={() => setIsVisible(false)}
        style={{
          background: "none",
          border: "none",
          color: styles.color,
          fontSize: "18px",
          cursor: "pointer",
          padding: "4px",
          borderRadius: "4px",
          opacity: 0.7,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "0.7";
        }}
      >
        ✕
      </button>
    </div>
  );
}
