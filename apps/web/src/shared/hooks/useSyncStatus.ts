"use client";

import { useState, useCallback } from "react";

interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingChanges: number;
}

/**
 * Хук для отслеживания статуса синхронизации с сервером
 */
export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    pendingChanges: 0,
  });

  const startSync = useCallback(() => {
    setSyncStatus(prev => ({
      ...prev,
      isSyncing: true,
    }));
  }, []);

  const finishSync = useCallback((success: boolean = true) => {
    setSyncStatus(prev => ({
      ...prev,
      isSyncing: false,
      lastSyncTime: success ? new Date() : prev.lastSyncTime,
      pendingChanges: success ? 0 : prev.pendingChanges,
    }));
  }, []);

  const addPendingChange = useCallback(() => {
    setSyncStatus(prev => ({
      ...prev,
      pendingChanges: prev.pendingChanges + 1,
    }));
  }, []);

  const removePendingChange = useCallback(() => {
    setSyncStatus(prev => ({
      ...prev,
      pendingChanges: Math.max(0, prev.pendingChanges - 1),
    }));
  }, []);

  const resetSyncStatus = useCallback(() => {
    setSyncStatus({
      isSyncing: false,
      lastSyncTime: null,
      pendingChanges: 0,
    });
  }, []);

  return {
    ...syncStatus,
    startSync,
    finishSync,
    addPendingChange,
    removePendingChange,
    resetSyncStatus,
  };
}
