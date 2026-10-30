// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TrainerOptInRoute } from "./optInRoute";
import type { TrainerDailyStatisticsTransport } from "./TrainerDailyStatisticsRoute";

const actor = { id: "trainer-1", role: "TRAINER" as const };
const schedule = [
  { id: "s1", date: "2026-10-25", isPublished: true,
    bundle: { id: "b1", title: "Основы", type: "daily_course", stepsCount: 2 },
    createdBy: { id: actor.id, username: "trainer" } },
  { id: "s2", date: "2026-10-26", isPublished: true,
    bundle: { id: "b2", title: "Команды", type: "daily_course", stepsCount: 2 },
    createdBy: { id: actor.id, username: "trainer" } },
];
const stats = { scheduleId: "s1", mskDate: "2026-10-25", bundleId: "b1",
  title: "Основы", totalSteps: 2,
  summary: { openedUsers: 6, startedUsers: 3, completedUsers: 2, openedWithoutStartUsers: 3 },
  users: [{ userId: "u1", username: "learner", openedAt: "2026-10-25T05:00:00.000Z",
    status: "IN_PROGRESS", completedSteps: 1, totalSteps: 2,
    lastActivityAt: "2026-10-25T10:00:00.000Z", currentStepTitle: "Сидеть",
    steps: [{ bundleStepId: "bs1", stepId: "step1", title: "Сидеть", order: 0,
      status: "COMPLETED", paused: false, remainingSec: null,
      createdAt: "2026-10-25T08:00:00.000Z", updatedAt: "2026-10-25T10:00:00.000Z" }],
  }],
};
const fetchStats = vi.fn(async (_path: string, _signal: AbortSignal): Promise<{
  status: number; headers: Record<string, string>; body: unknown;
}> => ({
  status: 200, headers: { "cache-control": "private, no-store" },
  body: { success: true, data: { schedule, selectedScheduleId: "s1", statistics: stats } },
}));
let host: HTMLDivElement;
let root: Root;
type Props = Parameters<typeof TrainerOptInRoute>[0];
async function render(props: Partial<Props> = {}) {
  const input: Props = {
    actor, token: "jwt", authEpoch: "one", fetchImpl: fetch,
    pathname: "/main-panel/daily-course/statistics", enableDailyStatistics: true,
    dailyStatisticsTransport: fetchStats as TrainerDailyStatisticsTransport,
    search: "?from=2026-10-25&to=2026-10-26", ...props,
  };
  await act(async () => root.render(createElement(TrainerOptInRoute, input)));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetchStats.mockClear(); host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("Trainer daily-course/statistics Vite full summary GET", () => {
  it("mounts source equivalent owned range, KPI, learner and step detail", async () => {
    await render();
    expect(fetchStats).toHaveBeenCalledTimes(1);
    expect(fetchStats.mock.calls[0]![0]).toBe(
      "/api/v1/trainer/daily-course/statistics?from=2026-10-25&to=2026-10-26");
    expect(host.textContent).toContain("Статистика курса дня");
    expect(host.textContent).toContain("Открыли день6");
    expect(host.textContent).toContain("learner");
    expect(host.textContent).toContain("1/2");
  });
  it("never paints private statistic rows when another principal replaces the actor", async () => {
    await render();
    expect(host.textContent).toContain("learner");
    await render({ getCurrentSession: () => null });
    expect(host.textContent).not.toContain("learner");
    expect(host.textContent).toContain("недоступна");
  });
  it("503 cannot masquerade as zero users and retry stays explicit", async () => {
    fetchStats.mockResolvedValueOnce({ status: 503,
      headers: { "cache-control": "private, no-store" },
      body: { success: false, data: { schedule: [], selectedScheduleId: null, statistics: null } },
    });
    await render();
    expect(host.textContent).toContain("Не удалось получить статистику");
    expect(host.textContent).not.toContain("Открыли день6");
    await act(async () => host.querySelector('button[type="button"]')!.dispatchEvent(
      new MouseEvent("click", { bubbles: true })));
    expect(fetchStats).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Открыли день6");
  });
});
