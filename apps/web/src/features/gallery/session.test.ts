import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
vi.mock("@gafus/csrf", () => ({
  useCSRFStore: { getState: () => ({ isTokenValid: () => true, token: "csrf" }) },
}));
import { galleryTransport } from "./api";
import { gallerySession } from "./session";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  gallerySession.setIdentity(crypto.randomUUID());
});
describe("gallery HTTP session fence", () => {
  it("401 aborts the queue/other requests, clears private queries and notifies viewer/editor boundary", async () => {
    const cache = new QueryClient();
    cache.setQueryData(["gallery", "owner", "private"], { signedUrl: "private" });
    const boundary = vi.fn(() => {
      void cache.cancelQueries();
      cache.clear();
    });
    const unsubscribe = gallerySession.subscribe(boundary);
    const abortQueue = vi.fn();
    const unregister = gallerySession.registerAbort(abortQueue);
    const other = deferred<Response>();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce((_url, options) => {
          signal = options.signal;
          return other.promise;
        })
        .mockResolvedValueOnce(new Response("", { status: 401 })),
    );
    const stale = galleryTransport("albums/private");
    await expect(galleryTransport("albums/refresh")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(gallerySession.blocked()).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(abortQueue).toHaveBeenCalledOnce();
    expect(cache.getQueryCache().getAll()).toHaveLength(0);
    expect(boundary).toHaveBeenCalledOnce();
    other.resolve(Response.json({ success: true, data: { signedUrl: "late" } }));
    await expect(stale).rejects.toThrow("Сессия");
    unsubscribe();
    unregister();
    cache.clear();
    vi.unstubAllGlobals();
  });
  it("a transient network failure does not invalidate identity", async () => {
    const epoch = gallerySession.snapshot();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(galleryTransport("albums")).rejects.toThrow("offline");
    expect(gallerySession.blocked()).toBe(false);
    expect(gallerySession.snapshot()).toBe(epoch);
    vi.unstubAllGlobals();
  });
  it("old identity success or 401 cannot repopulate data or expire the new identity", async () => {
    for (const response of [
      Response.json({ success: true, data: "old" }),
      new Response("", { status: 401 }),
    ]) {
      const pending = deferred<Response>();
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
      const request = galleryTransport("albums");
      gallerySession.setIdentity(crypto.randomUUID());
      pending.resolve(response);
      await expect(request).rejects.toThrow("Сессия");
      expect(gallerySession.blocked()).toBe(false);
    }
    vi.unstubAllGlobals();
  });
  it("fences decoded data when identity changes during response.json", async () => {
    const body = deferred<unknown>();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => body.promise }),
    );
    const request = galleryTransport("albums");
    await Promise.resolve();
    gallerySession.setIdentity(crypto.randomUUID());
    body.resolve({ success: true, data: "old" });
    await expect(request).rejects.toThrow("Сессия");
    expect(gallerySession.blocked()).toBe(false);
    vi.unstubAllGlobals();
  });
  it("allows a fresh sign-in for the same user after the explicit sign-out path", () => {
    gallerySession.setIdentity("returning-owner");
    gallerySession.invalidate(gallerySession.snapshot());
    gallerySession.endIdentity();
    expect(gallerySession.blocked()).toBe(true);
    gallerySession.setIdentity("returning-owner");
    expect(gallerySession.blocked()).toBe(false);
  });
});
