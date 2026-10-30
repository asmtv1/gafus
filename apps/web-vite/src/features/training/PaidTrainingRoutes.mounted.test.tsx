// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

const dayId = "c" + "d".repeat(24);
const course = (isPrivate = false) => ({
  id: "course1", name: isPrivate ? "PRIVATE_COURSE" : "Платный курс",
  type: "DOG_TRAINING", shortDesc: "Учимся дома", duration: "7 дней",
  isPaid: true, isPrivate, hasAccess: false,
  isFavorite: false, userStatus: "NOT_STARTED", trainingLevel: "BEGINNER",
});
const marketing = {
  courseId: "course1", courseType: "DOG_TRAINING", name: "Платный курс",
  description: "Описание курса", equipment: "Поводок", trainingLevel: "BEGINNER",
  outline: [{ id: dayId, title: "День первый", order: 0 }],
};
const lockedDay = {
  courseId: "course1", dayOnCourseId: dayId, trainingDayId: "physical_day_1",
  title: "День первый", type: "practice", description: "", userStatus: "NOT_STARTED",
  steps: [{ id: "c" + "t".repeat(24), order: 0, title: "Теория",
    type: "THEORY", status: "NOT_STARTED", durationSec: 15,
    locked: true, description: "", videoUrl: null, imageUrls: [],
    monetizationTarget: { targetType: "COURSE_STEP", targetId: "c" + "s".repeat(24) },
  }],
};
const ok = (data: unknown) => new Response(
  JSON.stringify({ success: true, data }), { status: 200 },
);
let cache: QueryClient;
let root: Root;
let host: HTMLDivElement;
let spy: ReturnType<typeof vi.fn>;
let privateCourse = false;
const tick = async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 70)); });
};
async function mount(path: string) {
  window.history.replaceState(null, "", path);
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <App />
  </QueryClientProvider>));
  for (let n = 0; n < 40 && !host.textContent?.includes(privateCourse
    ? "Курс недоступен" : "Платный курс"); n++) await tick();
  await tick();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  privateCourse = false;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "A", role: "USER" });
  spy = vi.fn(async (path: string) => {
    if (path === "/api/v1/courses") return ok([course(privateCourse)]);
    if (path === "/api/v1/public/paid-course-outline/DOG_TRAINING") return ok(marketing);
    if (path.startsWith("/api/v1/training/day?")) return ok(lockedDay);
    if (path === "/api/v1/gafus/status") return ok({
      wallet: { balance: 4 }, rules: { courseStepCost: 1, accessDurationSeconds: 604800 },
      enabled: { economy: true, spending: true },
    });
    throw Error("UNEXPECTED_HTTP " + path);
  });
  vi.stubGlobal("fetch", spy);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); host.remove(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("actual App /trainings paid bookmarks", () => {
  it("paid unentitled learner sees program instead of inaccessible route", async () => {
    await mount("/trainings/DOG_TRAINING");
    for (let i = 0; i < 40 && !host.textContent?.includes("День первый"); i++) await tick();
    expect(host.querySelector('[aria-label="Программа платного курса"]')).not.toBeNull();
    expect(host.textContent).toContain("День первый");
    expect(host.textContent).not.toContain("Курс недоступен или не найден");
    expect(host.querySelector(`a[href="/trainings/DOG_TRAINING/${dayId}"]`)).not.toBeNull();
    expect(spy.mock.calls.map(([path]) => path)).toContain(
      "/api/v1/public/paid-course-outline/DOG_TRAINING",
    );
  });
  it("private course never requests or renders a public paid outline", async () => {
    privateCourse = true;
    await mount("/trainings/DOG_TRAINING");
    expect(host.textContent).toContain("Курс недоступен или не найден");
    expect(host.textContent).not.toContain("День первый");
    const paths = spy.mock.calls.map(([path]) => path);
    expect(paths).toContain("/api/v1/courses");
    expect(paths).not.toContain("/api/v1/public/paid-course-outline/DOG_TRAINING");
    expect(paths.some((path: string) => path.startsWith("/api/v1/training/day?")))
      .toBe(false);
  });
  it("paid day direct bookmark uses protected preview GET without automatic wallet debit", async () => {
    await mount(`/trainings/DOG_TRAINING/${dayId}`);
    for (let i = 0; i < 45 && !host.textContent?.includes("Закрыт"); i++)
      await tick();
    expect(host.querySelector('[aria-label="Шаги платного курса"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Содержимое шага закрыто");
    expect(host.textContent).not.toContain("Выберите тариф");
    const step = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть закрытый шаг: Теория"]',
    );
    expect(step).not.toBeNull();
    await act(async () => step?.click());
    await tick();
    expect(host.textContent).toContain("Этот шаг пока закрыт");
    expect(host.textContent).toContain("Выберите, как удобнее продолжить обучение");
    expect(host.textContent).toContain("Открыть за гафусы");
    expect(host.textContent).not.toContain("Проверить баланс");
    expect(host.querySelector('a[href="/subscription"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Выберите тариф");
    expect(host.textContent).not.toContain("Не выбран");
    const paths = spy.mock.calls.map(([path]) => path);
    expect(paths).toContain("/api/v1/public/paid-course-outline/DOG_TRAINING");
    expect(paths.some((path: string) => path.startsWith("/api/v1/training/day?"))).toBe(true);
    expect(paths).toContain("/api/v1/gafus/status");
    expect(paths).not.toContain("/api/v1/gafus/unlock");
  });


});
