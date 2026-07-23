import { describe, expect, it } from "vitest";
import { deriveNetworkStatus } from "./networkStatus";

describe("deriveNetworkStatus", () => {
  it("reports offline when the device has no connection", () => {
    expect(
      deriveNetworkStatus({
        isConnected: false,
        isInternetReachable: null,
        type: "none",
      }),
    ).toEqual({
      isConnected: false,
      isInternetReachable: null,
      connectionType: "none",
      isOffline: true,
    });
  });

  it("reports offline when the network has no internet access", () => {
    expect(
      deriveNetworkStatus({
        isConnected: true,
        isInternetReachable: false,
        type: "wifi",
      }).isOffline,
    ).toBe(true);
  });

  it("stays optimistic while internet reachability is unknown", () => {
    expect(
      deriveNetworkStatus({
        isConnected: true,
        isInternetReachable: null,
        type: "wifi",
      }).isOffline,
    ).toBe(false);
  });
});
