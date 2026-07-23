import { create } from "zustand";
import {
  INITIAL_NETWORK_STATUS,
  type NetworkStatus,
} from "@/shared/lib/network/networkStatus";

export const useNetworkStatusStore = create<NetworkStatus>()(() => INITIAL_NETWORK_STATUS);

export function getIsOffline(): boolean {
  return useNetworkStatusStore.getState().isOffline;
}

export function setNetworkStatus(status: NetworkStatus): void {
  const current = useNetworkStatusStore.getState();

  if (
    current.isConnected === status.isConnected &&
    current.isInternetReachable === status.isInternetReachable &&
    current.connectionType === status.connectionType &&
    current.isOffline === status.isOffline
  ) {
    return;
  }

  useNetworkStatusStore.setState(status);
}
