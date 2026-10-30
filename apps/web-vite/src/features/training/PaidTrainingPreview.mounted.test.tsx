// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PaidTrainingPreview } from "./PaidTrainingPreview";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";

const dayId = "c" + "d".repeat(24);
const stepId = "c" + "s".repeat(24);
const template = "c" + "t".repeat(24);
const marketing = {
  courseId: "course1", courseType: "DOG_TRAINING", name: "Курс воспитания",
  description: "Описание курса", equipment: "Поводок", trainingLevel: "BEGINNER",
  outline: [{ id: dayId, title: "День 1. Команда рядом", order: 0, type: "regular", equipment: "Лакомство", estimatedDuration: 10, theoryMinutes: 2 }],
};
const ok = (data: unknown) => new Response(
  JSON.stringify({ success: true, data }), { status: 200 },
);
let root: Root;
let node: HTMLDivElement;
let cache: QueryClient;
async function tick() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
}
async function mount(dayRoute: string | null) {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <PaidTrainingPreview userId="A" courseType="DOG_TRAINING" dayId={dayRoute} />
  </QueryClientProvider>));
  for (let n = 0; n < 35 && node.textContent?.includes("Загружаем"); n++) await tick();
  await tick();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  node = document.createElement("div"); document.body.append(node);
  root = createRoot(node);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "A", role: "USER" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear(); node.remove(); vi.unstubAllGlobals();
});

describe("Next paid-course preview via protected steps, never leaks media", () => {
  it("shows day cards without early paywall, price, payment or private transport", async () => {
    const fetcher = vi.fn(async (path: string) => {
      if (path === "/api/v1/public/paid-course-outline/DOG_TRAINING") return ok(marketing);
      throw Error("UNEXPECTED_PAID_COURSE_OR_PAYMENT_REQUEST " + path);
    });
    vi.stubGlobal("fetch", fetcher);
    await mount(null);
    expect(node.textContent).toContain("Содержание");
    expect(node.textContent).toContain("План занятий");
    const card = node.querySelector(".training-next-day-card-surface");
    expect(card?.textContent).toContain("Тренировочный блок");
    expect(card?.textContent).toContain("Понадобится: Лакомство");
    expect(card?.textContent).toContain("Практика · 10 мин");
    expect(card?.textContent).toContain("Теория · 2 мин");
    expect(node.querySelectorAll(".training-next-day-card-link")).toHaveLength(1);
    expect(node.textContent).not.toContain("Доступно по подписке");
    expect(node.textContent).not.toContain("Выберите тариф");
    expect(node.textContent).not.toContain("2 500 ₽");
    expect(node.querySelector('button[type="submit"]')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const description = [...node.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.includes("Описание курса"));
    expect(description?.getAttribute("aria-expanded")).toBe("false");
    expect(description?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    await act(async () => description?.click());
    await tick();
    expect(description?.getAttribute("aria-expanded")).toBe("true");
    expect(node.textContent).toContain("Поводок");
    expect(node.textContent).toContain("Описание курса");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("anonymous marketing GET lists original outline but never calls paid day API", async () => {
    const fetcher = vi.fn(async (path: string) => {
      if (path === "/api/v1/public/paid-course-outline/DOG_TRAINING") return ok(marketing);
      throw Error("UNEXPECTED_PRIVATE_HTTP " + path);
    });
    vi.stubGlobal("fetch", fetcher);
    await mount(null);
    expect(node.textContent).toContain("Курс воспитания");
    expect(node.textContent).toContain("День 1. Команда рядом");
    expect(node.querySelector(`a[href="/trainings/DOG_TRAINING/${dayId}"]`)).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/public/paid-course-outline/DOG_TRAINING");
  });

  it("paid day uses independent protected Core GET, reveals no content before Gafus grant", async () => {
    let granted = false;
    const wallet = { serverNow: "2026-10-25T20:00:00Z", wallet: { balance: 4 },
      activity: { earned: 1, limit: 3, windowSeconds: 86400, remaining: 2, nextCapacityAt: null },
      rules: { postReward: 1, questionReward: 1, answerReward: 1,
        reactionThreshold: 10, reactionReward: 1, bestAnswerReward: 1,
        courseStepCost: 1, miniGuideCost: 1, accessDurationSeconds: 604800 },
      enabled: { economy: true, earning: true, spending: true }, settingsRevision: 7 };
    const fetcher = vi.fn(async (path: string) => {
      if (path === "/api/v1/public/paid-course-outline/DOG_TRAINING") return ok(marketing);
      if (path.startsWith("/api/v1/training/day?")) return ok({
        courseId: marketing.courseId, dayOnCourseId: dayId,
        trainingDayId: "physical_day_1", title: "День 1. Команда рядом",
        type: "practice", description: "", userStatus: "NOT_STARTED",
        steps: [{ id: template, order: 0, title: "Теория", type: "THEORY",
          status: "NOT_STARTED", durationSec: 10, locked: !granted,
          description: granted ? "Открытые упражнения" : "",
          imageUrls: [], videoUrl: null,
          ...(!granted ? { monetizationTarget: {
            targetType: "COURSE_STEP", targetId: stepId,
          } } : {}),
        }],
      });
      if (path === "/api/v1/gafus/status") return ok(wallet);
      if (path === "/api/v1/gafus/unlock") { granted = true; return ok({ spent: 1 }); }
      throw Error("UNEXPECTED_PAID_ACCESS " + path);
    });
    vi.stubGlobal("fetch", fetcher);
    await mount(dayId);
    for (let i = 0; i < 35 && !node.textContent?.includes("Закрыт"); i++)
      await tick();
    expect(node.querySelector('[aria-label="Шаги платного курса"]')).not.toBeNull();
    expect(node.textContent).not.toContain("Содержимое шага закрыто");
    expect(node.textContent).not.toContain("Выберите тариф");
    const lockedStep = node.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть закрытый шаг: Теория"]',
    );
    expect(lockedStep).not.toBeNull();
    await act(async () => lockedStep?.click());
    await tick();
    expect(node.textContent).toContain("Этот шаг пока закрыт");
    expect(node.textContent).toContain("Все шаги курса");
    expect(node.textContent).toContain("Один шаг за Гафусы");
    expect(node.querySelector('a[href="/subscription"]')?.textContent)
      .toContain("Выбрать подписку");
    expect(node.textContent).not.toContain("Не выбран");
    expect(node.textContent).not.toContain("Выберите тариф");
    expect(node.textContent).not.toContain("Для чтения статьи");
    expect(node.textContent).not.toContain("Открытые упражнения");
    // The read-only wallet status is fetched automatically when the step opens.
    expect(fetcher.mock.calls.filter(([path]) => path === "/api/v1/gafus/status"))
      .toHaveLength(1);
    expect(fetcher.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock"))
      .toHaveLength(0);
    expect(node.textContent).not.toContain("Проверить баланс");
    const spend = [...node.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.includes("Открыть за гафусы"));
    expect(spend).toBeDefined();
    expect(spend?.disabled).toBe(false);
    await act(async () => spend?.click());
    for (let i = 0; i < 35 && node.textContent?.includes("Этот шаг пока закрыт"); i++)
      await tick();
    expect(fetcher.mock.calls.filter(([path]) => path === "/api/v1/gafus/unlock"))
      .toHaveLength(1);
    expect(node.textContent).not.toContain("Этот шаг пока закрыт");
    expect(fetcher.mock.calls.filter(([path]) => path.startsWith("/api/v1/training/day?"))
      .length).toBeGreaterThanOrEqual(2);
    expect(node.textContent).toContain("Теория");
  });


});
