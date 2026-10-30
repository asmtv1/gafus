import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmPasswordReset, requestPasswordReset } from "./passwordRecoveryApi";

afterEach(() => vi.unstubAllGlobals());

describe("Hono password reset client", () => {
  it("sends an email request without JWT or absolute URLs", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, message: "Request accepted",
    }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    await requestPasswordReset("person@example.com");
    const [path, opts] = mock.mock.calls[0];
    expect(path).toBe("/api/v1/auth/password-reset-request");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("include");
    expect(JSON.parse(opts.body)).toEqual({ email: "person@example.com" });
    expect(JSON.stringify(opts)).not.toContain("Bearer");
  });

  it("sends one-time token only in POST body for reset", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
    }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const token = "a".repeat(40);
    await confirmPasswordReset(token, "Password1");
    const [path, opts] = mock.mock.calls[0];
    expect(path).toBe("/api/v1/auth/reset-password");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ token, password: "Password1" });
  });

  it("fails closed on invalid token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false, error: "Token expired",
    }), { status: 400 })));
    await expect(confirmPasswordReset("b".repeat(40), "Password1"))
      .rejects.toMatchObject({ status: 400 });
  });
});
