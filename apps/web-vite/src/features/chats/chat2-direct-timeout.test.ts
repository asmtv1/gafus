import { afterEach, describe, expect, it, vi } from "vitest";
import { chat2Api } from "./chat2Api";

afterEach(() => vi.unstubAllGlobals());

describe("Chat2 deep-link bounded POST", () => {
  it("uses local same-origin cookie auth and an abortable request", async () => {
    const request = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { conversationId: "existing-direct" } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", request);
    expect(await chat2Api.directByUsername("teamb")).toEqual({ conversationId: "existing-direct" });
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/chats/direct",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: expect.objectContaining({ "X-Gafus-Auth-Transport": "cookie" }),
        body: JSON.stringify({ username: "teamb" }),
        signal: expect.any(AbortSignal),
      }),
    );
    const signal: AbortSignal = request.mock.calls[0][1].signal;
    expect(signal.aborted).toBe(false);
  });

  it("denies malformed usernames before sending any network request", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(() => chat2Api.directByUsername("someone/else")).toThrow("Недопустимое имя пользователя");
    expect(request).not.toHaveBeenCalled();
  });
});
