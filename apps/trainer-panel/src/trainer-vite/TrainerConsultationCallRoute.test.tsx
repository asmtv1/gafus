// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTrainerCallOperations, trainerCallBookingId,
  TrainerConsultationCallRoute,
} from "./TrainerConsultationCallRoute";
import { createTrainerCookieFetch, validatedTrainerApiPath } from "./live/trainerBrowserAuth";

const actor = { id: "trainer-one", role: "TRAINER" as const };
const current = { actor, token: "witness", authEpoch: "session-a" };
const status = (body: unknown, code = 200) => new Response(JSON.stringify(body), {
  status: code,
  headers: { "cache-control": "private, no-store", "content-type": "application/json" },
});
const room = "gafus_" + "a".repeat(30);
const signed = "a".repeat(32);
const proof = "a".repeat(64);
const valid = {
  prepare: { success: true, data: { username: "g_u_user@app.acc.voximplant.com", room } },
  sign: { success: true, token: signed },
  admission: { success: true, data: { admission: "1800000000." + proof, expires: 1800000000 } },
};
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("Trainer Vox call route cookie/owner boundary", () => {
  it("matches a single validated booking ID, rejects ambiguity/traversal", () => {
    expect(trainerCallBookingId("/main-panel/consultations/call/a_12-b")).toBe("a_12-b");
    for (const path of [
      "/main-panel/consultations/call/%2e%2e",
      "/main-panel/consultations/call/a/b",
      "/main-panel/consultations/call/../edit",
      "/main-panel/consultations/call/id#evil",
    ]) expect(trainerCallBookingId(path)).toBeNull();
  });
  it("permitted preparatory calls only, no bearer token, no storage, no retry", async () => {
    const original = vi.fn(async (_path: RequestInfo | URL) => {
      const path = String(_path);
      if (path.endsWith("/prepare")) return status(valid.prepare);
      if (path.endsWith("/sign")) return status(valid.sign);
      if (path.endsWith("/admission")) return status(valid.admission);
      return status({ success: false }, 404);
    });
    const fetchImpl = createTrainerCookieFetch(original as typeof fetch, vi.fn());
    const ops = createTrainerCallOperations({
      bookingId: "booking-3", ...current,
      getCurrentSession: () => current, fetchImpl,
    });
    expect(await ops.prepare("booking-3")).toEqual(valid.prepare);
    expect(await ops.signKey("booking-3", "challenge-12")).toEqual(valid.sign);
    expect(await ops.authorizeJoin("booking-3")).toEqual(valid.admission);
    expect(original).toHaveBeenCalledTimes(3);
    for (const [path, init] of original.mock.calls as unknown as [string, RequestInit][]) {
      expect(validatedTrainerApiPath(path)).toBe(path);
      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("include");
      expect(new Headers(init.headers).has("authorization")).toBe(false);
      expect(init.cache).toBe("no-store");
    }
  });
  it("fails closed on changed principal, foreign booking, invalid challenge and 403", async () => {
    const called = vi.fn(async () => status({ success: false, error: "forbidden" }, 403));
    let session = { ...current };
    const ops = createTrainerCallOperations({
      bookingId: "booking-3", ...current,
      getCurrentSession: () => session, fetchImpl: called as typeof fetch,
    });
    expect((await ops.prepare("booking-4")).success).toBe(false);
    expect((await ops.signKey("booking-3", "bad")).success).toBe(false);
    expect(called).not.toHaveBeenCalled();
    session = { ...session, authEpoch: "retired" };
    expect((await ops.authorizeJoin("booking-3")).success).toBe(false);
    expect(called).not.toHaveBeenCalled();
    session = current;
    expect((await ops.prepare("booking-3")).success).toBe(false);
    expect(called).toHaveBeenCalledTimes(1);
  });
  it("does not expose Vox controls without a live TRAINER/ADMIN principal", async () => {
    await act(async () => root.render(createElement(TrainerConsultationCallRoute, {
      pathname: "/main-panel/consultations/call/booking-3", ...current,
      getCurrentSession: () => null, fetchImpl: vi.fn() as unknown as typeof fetch,
    })));
    expect(host.textContent).toContain("Нет доступа");
    expect(host.textContent).not.toContain("Подключиться");
  });
  it("mounts the shared Vox camera/mic UI with no network until user opts in", async () => {
    const fetchImpl = vi.fn();
    await act(async () => root.render(createElement(TrainerConsultationCallRoute, {
      pathname: "/main-panel/consultations/call/booking-3", ...current,
      getCurrentSession: () => current, fetchImpl: fetchImpl as unknown as typeof fetch,
    })));
    expect(host.querySelector("h1")?.textContent).toBe("Видеоконсультация");
    expect(host.textContent).toContain("Подключиться");
    expect(host.textContent).toContain("Выключить микрофон");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
