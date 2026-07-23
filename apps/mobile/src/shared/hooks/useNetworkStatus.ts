import type { NetworkStatus } from "@/shared/lib/network/networkStatus";
import { useNetworkStatusStore } from "@/shared/stores/networkStatusStore";

/**
 * Полный снимок состояния сети. Для проверки офлайна используйте
 * `useIsOffline`, чтобы не подписывать компонент на остальные поля.
 */
export function useNetworkStatus(): NetworkStatus {
  return useNetworkStatusStore();
}

/** Возвращает только офлайн-флаг и не вызывает лишние ререндеры. */
export function useIsOffline(): boolean {
  return useNetworkStatusStore((state) => state.isOffline);
}
