export interface NetworkStateSnapshot {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: string;
}

export interface NetworkStatus {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  connectionType: string | null;
  isOffline: boolean;
}

export const INITIAL_NETWORK_STATUS: NetworkStatus = {
  isConnected: null,
  isInternetReachable: null,
  connectionType: null,
  isOffline: false,
};

/**
 * `null` means that NetInfo has not determined reachability yet. We only switch
 * to offline mode when the platform explicitly reports a missing connection.
 */
export function deriveNetworkStatus(state: NetworkStateSnapshot): NetworkStatus {
  return {
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
    connectionType: state.type,
    isOffline: state.isConnected === false || state.isInternetReachable === false,
  };
}
