// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DailyCoursePanel } from "./DailyCoursePanel";
import type { DailyToday, DailyDay } from "./dailyCourseApi";
import { ApiError } from "../../shared/api/client";
const today: DailyToday = {
  mskDate: "2026-10-20",
  scheduleId: "schedule_A",
  userStatus: "IN_PROGRESS",
  day: {
    id: "bundle_A",
    title: "PRIVATE_OLD_TODAY",
    description: "PRIVATE_OLD_DESCRIPTION",
    type: "practice",
    estimatedDuration: 10,
    theoryMinutes: 2,
    stepsCount: 1,
  },
  stepsSummary: { total: 1, completed: 0 },
};
const detail: DailyDay = {
  scheduleId: "schedule_A",
  mskDate: "2026-10-20",
  trainingDayId: "bundle_A",
  bundleId: "bundle_A",
  title: "PRIVATE_DAY_TITLE",
  description: "PRIVATE_DAY_BODY",
  type: "practice",
  userStatus: "IN_PROGRESS",
  steps: [
    {
      id: "s1",
      title: "PRIVATE_DAY_STEP",
      description: "PRIVATE_STEP_BODY",
      type: "PRACTICE",
      status: "IN_PROGRESS",
      order: 0,
      durationSec: 60,
      locked: false,
      videoUrl: "https://cdn.example.invalid/private-video.mp4",
      imageUrls: [],
    },
  ],
};
const updated: DailyToday = {
  ...today,
  scheduleId: "schedule_B",
  mskDate: "2026-10-21",
  day: {
    ...today.day!,
    id: "bundle_B",
    title: "Новый курс дня",
    description: "Подтверждённое описание",
  },
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 35));
  });
}
async function mount(ui: React.ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={cache}>{ui}</QueryClientProvider>),
  );
  await flush();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("NO_NETWORK_ALLOWED");
    }),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("DailyCoursePanel fresh Moscow schedule and detail access", () => {
  it("DC-R01 cached old schedule is hidden during revalidation", async () => {
    const request = deferred<DailyToday>();
    cache.setQueryData(["daily-course", "today", "A"], today);
    const loadToday = vi.fn().mockReturnValue(request.promise);
    const loadDay = vi.fn().mockResolvedValue(detail);
    await mount(<DailyCoursePanel userId="A" loadToday={loadToday} loadDay={loadDay} />);
    expect(host.textContent).toContain("Перепроверяем курс дня");
    expect(host.textContent).not.toContain("PRIVATE_OLD_TODAY");
    expect(host.textContent).not.toContain("PRIVATE_OLD_DESCRIPTION");
    expect(host.querySelector("progress")).toBeNull();
    expect(loadDay).not.toHaveBeenCalled();
    await act(async () => request.resolve(updated));
    await flush();
    expect(host.textContent).toContain("Новый курс дня");
    expect(host.textContent).not.toContain("PRIVATE_OLD_TODAY");
  });
  it("DC-R02 403 after cached GET never exposes previously entitled day", async () => {
    const request = deferred<DailyToday>();
    cache.setQueryData(["daily-course", "today", "A"], today);
    await mount(
      <DailyCoursePanel
        userId="A"
        loadToday={() => request.promise}
        loadDay={async () => detail}
      />,
    );
    await act(async () => request.reject(new ApiError(403, "PRIVATE_BACKEND_SQL")));
    await flush();
    expect(host.textContent).toContain("Нет доступа к курсу дня");
    expect(host.textContent).not.toContain("PRIVATE_OLD_TODAY");
    expect(host.textContent).not.toContain("PRIVATE_BACKEND_SQL");
    expect(host.querySelector("progress")).toBeNull();
  });
  it("DC-R03 route day with cached entitled steps is hidden until confirmed", async () => {
    const request = deferred<DailyDay>();
    cache.setQueryData(["daily-course", "day", "A", today.mskDate, today.scheduleId], detail);
    const loadDay = vi.fn().mockReturnValue(request.promise);
    await mount(
      <DailyCoursePanel
        userId="A"
        loadToday={async () => today}
        loadDay={loadDay}
        routeMode
        routeScheduleId={today.scheduleId}
      />,
    );
    expect(loadDay).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Перепроверяем шаги курса дня");
    expect(host.textContent).not.toContain("PRIVATE_DAY_STEP");
    expect(host.textContent).not.toContain("PRIVATE_DAY_BODY");
    expect(host.querySelector("video")).toBeNull();
    await act(async () => request.resolve(detail));
    await flush();
    expect(host.textContent).toContain("PRIVATE_DAY_STEP");
  });
  it("DC-R04 cached day fails closed after late 401 and provides login", async () => {
    const request = deferred<DailyDay>();
    cache.setQueryData(["daily-course", "day", "A", today.mskDate, today.scheduleId], detail);
    await mount(
      <DailyCoursePanel
        userId="A"
        loadToday={async () => today}
        loadDay={() => request.promise}
        routeMode
        routeScheduleId={today.scheduleId}
      />,
    );
    await act(async () => request.reject(new ApiError(401, "PRIVATE_AUTH_STACK")));
    await flush();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.textContent).not.toContain("PRIVATE_DAY_STEP");
    expect(host.querySelector("video")).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_AUTH_STACK");
  });
  it("DC-R05 cached route mismatch withheld until GET resolves", async () => {
    const request = deferred<DailyToday>();
    cache.setQueryData(["daily-course", "today", "A"], today);
    await mount(
      <DailyCoursePanel
        userId="A"
        loadToday={() => request.promise}
        loadDay={async () => detail}
        routeMode
        routeScheduleId="schedule_other"
      />,
    );
    expect(host.textContent).toContain("Перепроверяем курс дня");
    expect(host.textContent).not.toContain("Задание не найдено или недоступно");
    await act(async () => request.resolve(updated));
    await flush();
    expect(host.textContent).toContain("Задание не найдено или недоступно");
  });
});

// COURSE011_DAILY_TERMINAL_READ — use existing real mounted screen + fake GET only.
function exactButton(name: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent?.trim() === name);
}
function noPrivateDaily() {
  expect(host.textContent).not.toContain("PRIVATE_OLD_TODAY");
  expect(host.textContent).not.toContain("PRIVATE_OLD_DESCRIPTION");
  expect(host.textContent).not.toContain("PRIVATE_DAY_STEP");
  expect(host.textContent).not.toContain("PRIVATE_DAY_BODY");
  expect(host.querySelector("video")).toBeNull();
  expect(host.querySelector("progress")).toBeNull();
}
describe("COURSE011_DAILY_TERMINAL_READ Today and Day error/recovery", () => {
  it.each([401, 403, 404])("Today HTTP%s: no private cache or pointless retry", async status => {
    cache.setQueryData(["daily-course", "today", "A"], today);
    const loadToday = vi.fn().mockRejectedValue(new ApiError(status, "PRIVATE_SQL_ERROR"));
    await mount(<DailyCoursePanel userId="A" loadToday={loadToday} loadDay={async () => detail} />);
    expect(loadToday).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(status === 401 ? "Сессия завершена" :
      status === 403 ? "Нет доступа" : "больше недоступен");
    expect(host.textContent).not.toContain("PRIVATE_SQL_ERROR");
    noPrivateDaily();
    expect(exactButton("Повторить загрузку")).toBeUndefined();
    expect(host.querySelector('a[href="/login"]') !== null).toBe(status === 401);
    await flush();
    expect(loadToday).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404])("Day HTTP%s: no cached steps/retry, back to Today works", async status => {
    cache.setQueryData(["daily-course", "day", "A", today.mskDate, today.scheduleId], detail);
    const loadDay = vi.fn().mockRejectedValue(new ApiError(status, "PRIVATE_SQL_ERROR"));
    await mount(<DailyCoursePanel userId="A" loadToday={async () => today}
      loadDay={loadDay} />);
    const open = exactButton("Посмотреть шаги");
    expect(open).toBeDefined();
    await act(async () => open?.click());
    await flush();
    expect(loadDay).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(status === 401 ? "Сессия завершена" :
      status === 403 ? "Нет доступа" : "больше недоступен");
    expect(host.textContent).not.toContain("PRIVATE_SQL_ERROR");
    noPrivateDaily();
    expect(exactButton("Повторить загрузку")).toBeUndefined();
    expect(host.querySelector('a[href="/login"]') !== null).toBe(status === 401);
    await act(async () => exactButton("К заданию дня")?.click());
    await flush();
    expect(host.textContent).toContain("PRIVATE_OLD_TODAY");
    expect(loadDay).toHaveBeenCalledTimes(1);
  });

  it.each(["Today", "Day"]) ("%s HTTP503: explicit retry restores fresh read only", async variant => {
    const first = deferred<DailyToday | DailyDay>();
    const loadToday = vi.fn().mockImplementation(() => variant === "Today"
      ? first.promise : Promise.resolve(today));
    const loadDay = vi.fn().mockImplementation(() => variant === "Day"
      ? first.promise : Promise.resolve(detail));
    await mount(<DailyCoursePanel userId="A" loadToday={loadToday} loadDay={loadDay}
      {...(variant === "Day" ? { routeMode: true, routeScheduleId: today.scheduleId } : {})} />);
    await act(async () => first.reject(new ApiError(503, "PRIVATE_TRANSIENT_SQL")));
    await flush();
    expect(host.textContent).toContain("Не удалось загрузить");
    expect(host.textContent).not.toContain("PRIVATE_TRANSIENT_SQL");
    expect(exactButton("Повторить загрузку")).toBeDefined();
    if (variant === "Day") {
      expect(host.textContent).not.toContain("PRIVATE_DAY_STEP");
      expect(host.querySelector("video")).toBeNull();
    } else noPrivateDaily();
    const load = variant === "Day" ? loadDay : loadToday;
    load.mockResolvedValueOnce(variant === "Day" ? detail : today);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => exactButton("Повторить загрузку")?.click());
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain(variant === "Day" ? "PRIVATE_DAY_STEP" : "PRIVATE_OLD_TODAY");
    expect(exactButton("Повторить загрузку")).toBeUndefined();
  });

  it.each(["Today", "Day"]) ("%s network error and two same-turn manual retries do not create extra GET", async variant => {
    const next = deferred<DailyToday | DailyDay>();
    const loadToday = vi.fn().mockImplementation(() => variant === "Today"
      ? Promise.reject(Error("PRIVATE_NETWORK_ERROR")) : Promise.resolve(today));
    const loadDay = vi.fn().mockImplementation(() => variant === "Day"
      ? Promise.reject(Error("PRIVATE_NETWORK_ERROR")) : Promise.resolve(detail));
    await mount(<DailyCoursePanel userId="A" loadToday={loadToday} loadDay={loadDay}
      {...(variant === "Day" ? { routeMode: true, routeScheduleId: today.scheduleId } : {})} />);
    expect(host.textContent).toContain("Не удалось загрузить");
    expect(host.textContent).not.toContain("PRIVATE_NETWORK_ERROR");
    const loader = variant === "Day" ? loadDay : loadToday;
    loader.mockReturnValue(next.promise);
    const button = exactButton("Повторить загрузку");
    expect(button).toBeDefined();
    await act(async () => { button?.click(); button?.click(); await Promise.resolve(); });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("PRIVATE_DAY_STEP");
    await act(async () => next.resolve(variant === "Day" ? detail : today));
    await flush();
    expect(host.textContent).toContain(variant === "Day" ? "PRIVATE_DAY_STEP" : "PRIVATE_OLD_TODAY");
  });

  it("Day mismatched server date never unlocks cached private steps or retries wrong schedule", async () => {
    const loadDay = vi.fn().mockResolvedValue({ ...detail, mskDate: "2026-10-19" });
    cache.setQueryData(["daily-course", "day", "A", today.mskDate, today.scheduleId], detail);
    await mount(<DailyCoursePanel userId="A" loadToday={async () => today}
      loadDay={loadDay} routeMode routeScheduleId={today.scheduleId} />);
    expect(host.textContent).toContain("Не удалось загрузить");
    expect(host.textContent).not.toContain("PRIVATE_DAY_STEP");
    expect(host.querySelector("video")).toBeNull();
    expect(loadDay).toHaveBeenCalledTimes(1);
    expect(exactButton("Повторить загрузку")).toBeDefined();
  });
});
