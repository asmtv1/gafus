import { usePreventionSyncOnReconnect } from "@/shared/hooks/usePreventionSyncOnReconnect";

/**
 * Компонент-обёртка: при reconnect вызывает processQueue для очереди профилактики.
 */
export function SyncPreventionOnReconnect() {
  usePreventionSyncOnReconnect();
  return null;
}
