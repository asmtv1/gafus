import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { jwtVerifyMock, syncMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
  syncMock: vi.fn(),
}));
vi.mock("jose", async (importOriginal) => ({
  ...await importOriginal<typeof import("jose")>(),
  jwtVerify: jwtVerifyMock,
}));
vi.mock("../../modules/app-subscription/google-play-service.js", () => ({
  syncGooglePlayPurchase: syncMock,
  reconcileGooglePlayPurchases: vi.fn(),
}));

import { googlePlayNotifications } from "./google-play-notifications";

function notification(packageName = "ru.gafus.app", authorization?: string) {
  const event = { packageName, subscriptionNotification: { purchaseToken: "receipt" } };
  return googlePlayNotifications.request("/rtdn", {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify(event)).toString("base64") } }),
  });
}

describe("authenticated Google Play Pub/Sub push", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("GOOGLE_PLAY_RTDN_EMAIL", "play-push@example.test");
    vi.stubEnv("GOOGLE_PLAY_RTDN_AUDIENCE", "https://api.example.test/api/v1/google-play/rtdn");
    jwtVerifyMock.mockResolvedValue({ payload: { email: "play-push@example.test", email_verified: true } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects absent or mismatched service identity before processing", async () => {
    expect((await notification()).status).toBe(401);
    jwtVerifyMock.mockResolvedValueOnce({ payload: { email: "someone-else@example.test", email_verified: true } });
    expect((await notification("ru.gafus.app", "Bearer mocked")).status).toBe(401);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("accepts an authenticated SDK notification only for the GAFUS package", async () => {
    expect((await notification("some.other.app", "Bearer mocked")).status).toBe(204);
    expect(syncMock).not.toHaveBeenCalled();
    expect((await notification("ru.gafus.app", "Bearer mocked")).status).toBe(204);
    expect(syncMock).toHaveBeenCalledOnce();
    expect(syncMock).toHaveBeenCalledWith("receipt");
    expect(jwtVerifyMock).toHaveBeenCalledWith("mocked", expect.any(Function), expect.objectContaining({
      audience: "https://api.example.test/api/v1/google-play/rtdn",
    }));
  });

  it("asks Pub/Sub to retry a transient lookup failure", async () => {
    syncMock.mockRejectedValueOnce(new Error("upstream unavailable"));
    expect((await notification("ru.gafus.app", "Bearer mocked")).status).toBe(503);
  });
});
