// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TrainerDailyCalendarGrid } from "./TrainerDailyCalendarGrid";
import { TrainerDailyStatisticsContent } from "./TrainerDailyStatisticsContent";
import { TrainerStatisticsContent } from "./TrainerStatisticsContent";
import type { Schedule } from "./tr014ScheduleRangeRead20261022";
import type { CourseStatistics, StepStatistics } from "./trainerStatisticsProposedConsumer";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function type(selector: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(selector);
  if (!element) throw Error("MISSING_INPUT: " + selector);
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!set) throw Error("MISSING_INPUT_SETTER");
  await act(async () => {
    set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function select(selector: string, value: string) {
  const element = host.querySelector<HTMLSelectElement>(selector);
  if (!element) throw Error("MISSING_SELECT: " + selector);
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function click(selector: string) {
  const element = host.querySelector<HTMLButtonElement>(selector);
  if (!element) throw Error("MISSING_BUTTON: " + selector);
  await act(async () => element.click());
}

const schedules: Schedule[] = [
  { id: "day_1", date: "2026-11-03", isPublished: true,
    bundle: { id: "bundle_1", title: "Ёжик учит сидеть", type: "daily_course", stepsCount: 3 },
    createdBy: { id: "trainer_1", username: "kinolog" } },
  { id: "day_2", date: "2026-11-07", isPublished: false,
    bundle: { id: "bundle_2", title: "Собака и поводок", type: "daily_course", stepsCount: 2 },
    createdBy: { id: "trainer_1", username: "kinolog" } },
];
describe("daily course visual calendar", () => {
  it("renders all 30 days and distinguishes published, draft and unassigned", async () => {
    await act(async () => root.render(createElement(TrainerDailyCalendarGrid,
      { from: "2026-11-03", rows: schedules })));
    expect(host.querySelectorAll(".trainer-workspace-calendar-day")).toHaveLength(30);
    expect(host.querySelectorAll(".trainer-workspace-calendar-day.is-published")).toHaveLength(1);
    expect(host.querySelectorAll(".trainer-workspace-calendar-day.is-draft")).toHaveLength(1);
    expect(host.querySelectorAll(".trainer-workspace-calendar-day.is-empty")).toHaveLength(28);
  });
  it("finds a bundle with ё/e normalization and filters only draft dates", async () => {
    await act(async () => root.render(createElement(TrainerDailyCalendarGrid,
      { from: "2026-11-03", rows: schedules })));
    await type('input[placeholder="Название связки, автор или дата…"]', "ежик сидеть");
    expect(host.querySelectorAll(".trainer-workspace-calendar-day")).toHaveLength(1);
    expect(host.textContent).toContain("Ёжик учит сидеть");
    await type('input[placeholder="Название связки, автор или дата…"]', "");
    await select(".trainer-workspace-calendar select", "draft");
    expect(host.querySelectorAll(".trainer-workspace-calendar-day")).toHaveLength(1);
    await click(".trainer-workspace-calendar-day");
    expect(host.querySelector('[aria-label="Выбранный день"]')?.textContent)
      .toContain("Собака и поводок");
  });
});
describe("daily statistics participant table", () => {
  const users = Array.from({ length: 26 }, (_, index) => ({
    userId: `u_${index}`, username: index === 24 ? "Ёжик Тренировщик" : `Ученик ${index}`,
    status: index % 2 === 0 ? "COMPLETED" : "IN_PROGRESS",
    completedSteps: index % 2 === 0 ? 3 : 1, totalSteps: 3,
    currentStepTitle: index === 24 ? "Сидеть спокойно" : "Шаг",
    openedAt: "2026-11-02T10:00:00.000Z",
    lastActivityAt: new Date(Date.UTC(2026, 10, 3, 11, 0, index)).toISOString(),
    steps: [{ bundleStepId: `link_${index}`, title: "Работа с поводком", status: "COMPLETED" }],
  }));
  it("searches across all 26 users before pagination and displays progress", async () => {
    await act(async () => root.render(createElement(TrainerDailyStatisticsContent, {
      data: { title: "Сидеть", summary: {
        openedUsers: 26, startedUsers: 25, completedUsers: 13, openedWithoutStartUsers: 1,
      }, users },
    })));
    expect(host.querySelectorAll(".trainer-workspace-table-scroll tbody tr")).toHaveLength(20);
    expect(host.textContent).toContain("Страница 1 из 2");
    await type('input[placeholder="Имя, ID или название шага…"]', "ежик сидеть");
    expect(host.textContent).toContain("Ёжик Тренировщик");
    expect(host.querySelectorAll(".trainer-workspace-table-scroll tbody tr")).toHaveLength(1);
    expect(host.querySelector('progress[aria-label="Прогресс Ёжик Тренировщик"]'))
      .toHaveProperty("value", 100);
    await type('input[placeholder="Имя, ID или название шага…"]', "");
    await select(".trainer-workspace-filters select", "IN_PROGRESS");
    expect(host.querySelectorAll(".trainer-workspace-table-scroll tbody tr")).toHaveLength(13);
  });
});
const statisticsCourses: CourseStatistics = {
  courses: Array.from({ length: 24 }, (_, index) => ({
    id: `course_${index}`, name: index === 22 ? "Ёжик и команда рядом" : `Курс ${index}`,
    logoImg: "", avgRating: null, isPrivate: index === 22,
    isPaid: false, isPersonalized: false, trainingLevel: "BEGINNER" as const,
    totalUsers: 5, completedUsers: 2, inProgressUsers: 2, notStartedUsers: 1,
  })),
  totalCourses: 24, totalDays: 38,
};
const statisticsSteps: StepStatistics = {
  steps: [{ id: "step_1", title: "Поводок и прогулка", durationSec: 50,
    usedInDaysCount: 2, usedInCoursesCount: 1 }],
  totalSteps: 1, progressMetrics: "NOT_COMPUTED",
};
describe("trainer statistics course and step catalog", () => {
  it("has real completion percentages and searches 24 course rows before pagination", async () => {
    await act(async () => root.render(createElement(TrainerStatisticsContent, {
      kind: "courses", data: statisticsCourses,
    })));
    expect(host.querySelectorAll(".trainer-workspace-table-scroll tbody tr")).toHaveLength(20);
    expect(host.textContent).toContain("Курсов: 24");
    await type('input[placeholder="Название или ID…"]', "ежик рядом");
    expect(host.querySelectorAll(".trainer-workspace-table-scroll tbody tr")).toHaveLength(1);
    expect(host.textContent).toContain("Ёжик и команда рядом");
    expect(host.querySelector("progress")?.getAttribute("value")).toBe("40");
  });
  it("keeps precise step utilization without fake user progress", async () => {
    await act(async () => root.render(createElement(TrainerStatisticsContent, {
      kind: "steps", data: statisticsSteps,
    })));
    expect(host.textContent).toContain("Поводок и прогулка");
    expect(host.textContent).toContain("используется в днях: 2, в курсах: 1");
    expect(host.textContent).toContain("Прогресс пользователей для шагов не рассчитывается");
  });
});
