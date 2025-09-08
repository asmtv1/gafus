"use client";

import { useSyncStatus } from "@shared/hooks/useSyncStatus";

interface SyncStatusIndicatorProps {
  className?: string;
}

export function SyncStatusIndicator({ className = "" }: SyncStatusIndicatorProps) {
  const { isSyncing, lastSyncTime, pendingChanges } = useSyncStatus();

  if (!isSyncing && pendingChanges === 0 && !lastSyncTime) {
    return null;
  }

  const getStatusText = () => {
    if (isSyncing) {
      return "Синхронизация...";
    }
    if (pendingChanges > 0) {
      return `Ожидает синхронизации: ${pendingChanges}`;
    }
    if (lastSyncTime) {
      const timeAgo = Math.floor((Date.now() - lastSyncTime.getTime()) / 1000);
      if (timeAgo < 60) {
        return `Синхронизировано ${timeAgo}с назад`;
      }
      return `Синхронизировано ${Math.floor(timeAgo / 60)}м назад`;
    }
    return "";
  };

  const getStatusColor = () => {
    if (isSyncing) return "text-blue-600";
    if (pendingChanges > 0) return "text-yellow-600";
    return "text-green-600";
  };

  const getStatusIcon = () => {
    if (isSyncing) return "🔄";
    if (pendingChanges > 0) return "⏳";
    return "✅";
  };

  return (
    <div className={`flex items-center gap-2 text-sm ${getStatusColor()} ${className}`}>
      <span className="animate-spin">{getStatusIcon()}</span>
      <span>{getStatusText()}</span>
    </div>
  );
}
