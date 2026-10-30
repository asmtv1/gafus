import { afterEach, describe, expect, it, vi } from "vitest";
import { previewRegistrationPromoCode, registerAccount } from "./registerApi";

const payload = {
  name: "tester",
  email: "test@example.org",
  password: "Password1",
  tempSessionId: "9d7ca270-0e15-4e37-a0f9-9c62529c63d2",
  registrationChannel: "WEB" as const,
  consentPayload: {
    acceptPersonalData: true as const,
    acceptPrivacyPolicy: true as const,
    acceptDataDistribution: true as const,
  },
};
const user = { id: "test", username: "tester", role: "USER" };
afterEach(() => vi.unstubAllGlobals());

describe("registration transport", () => {
  it("posts all consent and idempotency fields in secure cookie mode without Bearer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { user },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await registerAccount(payload)).toEqual({ user });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/register");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(options.headers["X-Gafus-Auth-Transport"]).toBe("cookie");
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual(payload);
  });

  it("checks promo through the backend without inventing eligibility", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { code: "HELLO" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await previewRegistrationPromoCode(" hello ")).toEqual({ code: "HELLO" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/registration-promo-preview");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      promoCode: " hello ",
    });
  });

  it("does not silently sign in on registration errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false, error: "Conflict",
    }), { status: 409 })));
    await expect(registerAccount(payload)).rejects.toMatchObject({ status: 409 });
  });
});
