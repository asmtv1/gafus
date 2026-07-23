import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_NETWORK_STATUS } from "@/shared/lib/network/networkStatus";
import { getIsOffline, setNetworkStatus, useNetworkStatusStore } from "./networkStatusStore";

describe("network status store", () => {
  beforeEach(() => {
    useNetworkStatusStore.setState(INITIAL_NETWORK_STATUS, true);
  });

  it("exposes the latest offline state without a React subscription", () => {
    setNetworkStatus({
      isConnected: false,
      isInternetReachable: null,
      connectionType: "none",
      isOffline: true,
    });

    expect(getIsOffline()).toBe(true);
  });

  it("does not notify subscribers when NetInfo repeats the same snapshot", () => {
    const listener = vi.fn();
    const unsubscribe = useNetworkStatusStore.subscribe(listener);

    setNetworkStatus(INITIAL_NETWORK_STATUS);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
