import { beforeEach, describe, expect, it, vi } from "vitest";

const applicationState = vi.hoisted(() => ({
  version: "1.6.4" as string | null,
}));

vi.mock("expo-application", () => ({
  get nativeApplicationVersion() {
    return applicationState.version;
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

import { getMobileClientHeaders } from "./client-context";

describe("mobile client context headers", () => {
  beforeEach(() => {
    applicationState.version = "1.6.4";
  });

  it("sends the native semantic app version", () => {
    expect(getMobileClientHeaders()).toEqual({
      "X-Client-Platform": "ios",
      "X-Client-Version": "1.6.4",
    });
  });

  it("omits a missing or invalid app version", () => {
    applicationState.version = null;
    expect(getMobileClientHeaders()).toEqual({
      "X-Client-Platform": "ios",
    });
    applicationState.version = "development";
    expect(getMobileClientHeaders()).toEqual({
      "X-Client-Platform": "ios",
    });
  });
});
