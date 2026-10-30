// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { TrainingStepUnlock, unlockTrainingStepWithGafus } from "./TrainingStepUnlock";

const dayOnCourseId = "c" + "d".repeat(24);
const stepOnDayId = "c" + "s".repeat(24);
const status = (balance = 8) => ({
  serverNow: "2026-10-25T20:00:00Z", wallet: { balance },
  activity: { earned: 2, limit: 3, windowSeconds: 86400, remaining: 1,
    nextCapacityAt: null },
  rules: { postReward: 1, questionReward: 1, answerReward: 1,
    reactionThreshold: 10, reactionReward: 1, bestAnswerReward: 1,
    courseStepCost: 1, miniGuideCost: 1, accessDurationSeconds: 604800 },
  enabled: { economy: true, earning: true, spending: true }, settingsRevision: 7,
});
const ok = (data: unknown) => new Response(
  JSON.stringify({ success: true, data }), { status: 200 },
);
let root: Root;
let host: HTMLDivElement;
let cache: QueryClient;
let verify: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
const flush = async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
};
async function mount(compact = false, shouldFlush = true, strict = false) {
  const node = <QueryClientProvider client={cache}>
    <TrainingStepUnlock userId="A" dayOnCourseId={dayOnCourseId}
      stepOnDayId={stepOnDayId} onVerify={verify} compact={compact} />
  </QueryClientProvider>;
  await act(async () => root.render(strict ? <StrictMode>{node}</StrictMode> : node));
  if (shouldFlush) await flush();
}
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent?.includes(label));
  expect(button, "Missing control " + label).toBeDefined();
  await act(async () => button?.click());
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "A", role: "USER" });
  verify = vi.fn().mockResolvedValue(true);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("locked training step Gafus unlock is Core-ledger-backed", () => {
  it("on explicit click reads balance; one exact POST; confirms target via GET callback", async () => {
    const spy = vi.fn(async (path: string, _options: RequestInit) => path.endsWith("/status")
      ? ok(status()) : ok({ alreadyUnlocked: false, expiresAt: "2026-11-01" }));
    vi.stubGlobal("fetch", spy);
    await mount();
    expect(spy).not.toHaveBeenCalled();
    await click("Открыть доступ");
    expect(host.textContent).toContain("Стоимость шага: 1");
    expect(spy.mock.calls).toHaveLength(1);
    await click("Открыть за гафусы");
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock")).toHaveLength(1);
    expect(verify).toHaveBeenCalledOnce();
    const [, options] = spy.mock.calls.find(([path]) => path === "/api/v1/gafus/unlock")!;
    expect(options).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(options.body as string).target).toEqual({
      type: "COURSE_STEP", dayOnCourseId, stepOnDayId,
    });
    expect(host.textContent).toContain("Доступ к шагу подтверждён");
  });

  it("ACK loss stops POST until explicit readback; retry reuses exact original ID", async () => {
    verify.mockResolvedValue(false);
    let unlockCalls = 0;
    const spy = vi.fn(async (path: string, _options: RequestInit) => {
      if (path.endsWith("/status")) return ok(status());
      if (path === "/api/v1/gafus/unlock") {
        unlockCalls++;
        if (unlockCalls === 1) throw Error("ACK_LOST_PRIVATE_TOKEN");
        return ok({ alreadyUnlocked: true });
      }
      throw Error("Unexpected path " + path);
    });
    vi.stubGlobal("fetch", spy);
    await mount(); await click("Открыть доступ"); await click("Открыть за гафусы");
    expect(host.textContent).toContain("Исход открытия неизвестен");
    expect(host.textContent).not.toContain("ACK_LOST_PRIVATE_TOKEN");
    const first = spy.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock");
    expect(first).toHaveLength(1);
    await click("Проверить доступ на сервере");
    expect(verify).toHaveBeenCalledOnce();
    await click("Повторить тот же запрос");
    const writes = spy.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock");
    expect(writes).toHaveLength(2);
    expect(JSON.parse(writes[0][1].body as string).clientRequestId)
      .toBe(JSON.parse(writes[1][1].body as string).clientRequestId);
  });

  it("insufficient balance never enables POST", async () => {
    const spy = vi.fn(async () => ok(status(0)));
    vi.stubGlobal("fetch", spy);
    await mount(); await click("Открыть доступ");
    expect(host.textContent).toContain("Недостаточно гафусов");
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("session switch retires unlock controls and hides wallet", async () => {
    const spy = vi.fn(async () => ok(status()));
    vi.stubGlobal("fetch", spy);
    await mount(); await click("Открыть доступ");
    expect(host.textContent).toContain("Стоимость шага");
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "B", username: "B", role: "USER" }));
    await flush();
    expect(host.textContent).not.toContain("Стоимость шага");
    expect(host.textContent).toContain("Сессия изменилась");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("StrictMode mount replay starts a fresh wallet GET after aborting the old one", async () => {
    const requests: AbortSignal[] = [];
    const spy = vi.fn((path: string, options: RequestInit) => {
      if (path !== "/api/v1/gafus/status") throw Error("UNEXPECTED_REQUEST");
      const signal = options.signal!;
      requests.push(signal);
      if (requests.length !== 1) return Promise.resolve(ok(status()));
      return new Promise<Response>((_, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException(
          "Cancelled strict mode mount", "AbortError",
        )), { once: true });
      });
    });
    vi.stubGlobal("fetch", spy);
    await mount(true, true, true);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.aborted).toBe(true);
    // The read helper also closes the successful fetch signal after parsing.
    // Its completion is verified by rendered status, not the later signal state.
    expect(host.textContent).toContain("Гафусы: 8");
    expect(host.textContent).not.toContain("Проверяем баланс и стоимость");
    const spend = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(item => item.textContent?.includes("Открыть за гафусы"));
    expect(spend?.disabled).toBe(false);
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock"))
      .toHaveLength(0);
  });

  it("StrictMode ignores late first GET after replacement status is ready", async () => {
    let resolveFirst!: (value: Response) => void;
    const stale = new Promise<Response>(resolve => { resolveFirst = resolve; });
    let statusCalls = 0;
    const spy = vi.fn((path: string) => {
      if (path !== "/api/v1/gafus/status") throw Error("UNEXPECTED_REQUEST");
      statusCalls++;
      return statusCalls === 1 ? stale : Promise.resolve(ok(status(3)));
    });
    vi.stubGlobal("fetch", spy);
    await mount(true, true, true);
    expect(statusCalls).toBe(2);
    expect(host.textContent).toContain("Гафусы: 3");
    await act(async () => resolveFirst(ok(status(900))));
    await flush();
    expect(host.textContent).toContain("Гафусы: 3");
    expect(host.textContent).not.toContain("Гафусы: 900");
    expect(host.textContent).not.toContain("Проверяем баланс и стоимость");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("compact gate shows direct unlock, auto-fetches wallet, never auto-spends", async () => {
    let resolveStatus!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { resolveStatus = resolve; });
    const spy = vi.fn(async (path: string) => path.endsWith("/status")
      ? pending : ok({ alreadyUnlocked: false }));
    vi.stubGlobal("fetch", spy);
    await mount(true);
    const spend = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(item => item.textContent?.includes("Открыть за гафусы"));
    expect(spend).toBeDefined();
    expect(spend?.disabled).toBe(true);
    expect(host.textContent).not.toContain("Проверить баланс");
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/gafus/status"))
      .toHaveLength(1);
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock"))
      .toHaveLength(0);
    await act(async () => resolveStatus(ok(status())));
    await flush();
    expect(host.textContent).toContain("Гафусы: 8");
    expect(spend?.disabled).toBe(false);
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock"))
      .toHaveLength(0);
    await click("Открыть за гафусы");
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock"))
      .toHaveLength(1);
    expect(verify).toHaveBeenCalledOnce();
  });

  it("compact gate prevents spending when wallet is empty or economy is off", async () => {
    const spy = vi.fn(async () => ok(status(0)));
    vi.stubGlobal("fetch", spy);
    await mount(true);
    const spend = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(item => item.textContent?.includes("Открыть за гафусы"));
    expect(spend?.disabled).toBe(true);
    expect(host.textContent).toContain("Недостаточно гафусов");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();
  });

  it("compact gate blocks spending when server disables the economy", async () => {
    const result = status();
    result.enabled.economy = false;
    const spy = vi.fn(async (_path: string) => ok(result));
    vi.stubGlobal("fetch", spy);
    await mount(true);
    const spend = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(item => item.textContent?.includes("Открыть за гафусы"));
    expect(spend?.disabled).toBe(true);
    expect(host.textContent).toContain("Открытие за гафусы сейчас недоступно");
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock"))
      .toHaveLength(0);
  });

  it("ends a permanently hanging read in 10 seconds, aborts GET and allows safe retry", async () => {
    let resolveStalled!: (response: Response) => void;
    const stalled = new Promise<Response>(resolve => { resolveStalled = resolve; });
    let calls = 0;
    const spy = vi.fn(async (path: string, _opts: RequestInit) => {
      if (path !== "/api/v1/gafus/status") throw Error("UNEXPECTED_REQUEST");
      calls++;
      return calls === 1 ? stalled : ok(status());
    });
    vi.stubGlobal("fetch", spy);
    vi.useFakeTimers();
    await mount(true, false);
    expect(host.textContent).toContain("Проверяем баланс и стоимость");
    const spend = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(item => item.textContent?.includes("Открыть за гафусы"));
    expect(spend?.disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(10010); });
    expect(host.textContent).not.toContain("Проверяем баланс и стоимость");
    expect(host.textContent).toContain("Сервер слишком долго отвечает");
    expect(host.textContent).toContain("Повторить загрузку баланса");
    expect(spend?.disabled).toBe(true);
    const firstOptions = spy.mock.calls[0]?.[1];
    expect(firstOptions?.method).toBe("GET");
    expect(firstOptions?.signal?.aborted).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    // A timed-out GET may arrive after the deadline from a transport that
    // ignores AbortSignal; it must not revive stale payment state.
    await act(async () => resolveStalled(ok(status(900))));
    expect(host.textContent).not.toContain("Гафусы: 900");
    await click("Повторить загрузку баланса");
    expect(host.textContent).toContain("Гафусы: 8");
    expect(spend?.disabled).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock"))
      .toHaveLength(0);
  });

  it("compact gate offers manual read-only retry after wallet GET failure", async () => {
    let n = 0;
    const spy = vi.fn(async () => (++n === 1
      ? Promise.reject(Error("PRIVATE_WALLET_FAILURE")) : ok(status())));
    vi.stubGlobal("fetch", spy);
    await mount(true);
    expect(host.textContent).toContain("Не удалось проверить баланс гафусов");
    expect(host.textContent).not.toContain("PRIVATE_WALLET_FAILURE");
    expect(host.textContent).toContain("Повторить загрузку баланса");
    expect(spy).toHaveBeenCalledTimes(1);
    await click("Повторить загрузку баланса");
    expect(host.textContent).toContain("Гафусы: 8");
    expect(host.textContent).not.toContain("Не удалось проверить баланс гафусов");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(verify).not.toHaveBeenCalled();
  });

  it("compact gate rejects late wallet GET after owner switch", async () => {
    let resolveStatus!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { resolveStatus = resolve; });
    const spy = vi.fn(async () => pending);
    vi.stubGlobal("fetch", spy);
    await mount(true);
    await act(async () => cache.setQueryData(CURRENT_USER_QUERY_KEY,
      { id: "B", username: "B", role: "USER" }));
    await flush();
    await act(async () => resolveStatus(ok(status())));
    await flush();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Гафусы: 8");
    expect(host.textContent).not.toContain("Открыть за гафусы");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();
  });

  it("client rejects forged or cross-namespace identifiers before contacting Core", async () => {
    const spy = vi.fn(); vi.stubGlobal("fetch", spy);
    await expect(unlockTrainingStepWithGafus({
      dayOnCourseId, stepOnDayId: "../malicious", clientRequestId: "request0123",
    })).rejects.toThrow("INVALID_GAFUS_STEP_TARGET");
    expect(spy).not.toHaveBeenCalled();
  });
});
