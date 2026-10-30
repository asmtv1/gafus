// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerDashboardRoute } from "./TrainerDashboardRoute";

const actor = { id: "trainer-1", role: "TRAINER" as const };
const headers = { "cache-control": "private, no-store" };
const course = {
  id: "course-1", name: "Курс послушания", logoImg: "", avgRating: null,
  isPrivate: false, isPaid: false, isPersonalized: false,
  trainingLevel: "BEGINNER", totalUsers: 2, completedUsers: 1,
  inProgressUsers: 1, notStartedUsers: 0,
};
let deny = false;
const read = vi.fn(async (path: string) => {
  if (path.includes("/courses")) return { status: deny ? 403 : 200, headers,
    body: { success: true, data: { courses: [course], totalCourses: 1, totalDays: 4 } } };
  return { status: deny ? 403 : 200, headers,
    body: { success: true, data: { steps: [], totalSteps: 0,
      progressMetrics: "NOT_COMPUTED" } } };
});
let host: HTMLDivElement;
let root: Root;
const current = () => ({ actor, token: "opaque", authEpoch: "epoch-1" });
async function mount(props: Partial<Parameters<typeof TrainerDashboardRoute>[0]> = {}) {
  await act(async () => root.render(createElement(TrainerDashboardRoute, {
    actor, token: "opaque", authEpoch: "epoch-1", fetchRead: read,
    getCurrentSession: current, ...props,
  })));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  deny = false; read.mockClear();
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("trainer live dashboard", () => {
  it("shows scoped Next-style course list and edit links without PII", async () => {
    await mount();
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0]![0]).toContain("scope=own");
    expect(host.textContent).toContain("Курс послушания");
    const link = host.querySelector<HTMLAnchorElement>(
      'a[href="/main-panel/courses/course-1/edit"]');
    expect(link?.textContent).toBe("Редактировать");
    expect(host.textContent).toContain("Дней: 4");
  });
  it("admin requests global scope and moderator sees no data", async () => {
    const admin = { id: "admin-1", role: "ADMIN" as const };
    await mount({ actor: admin, getCurrentSession: () => ({
      actor: admin, token: "opaque", authEpoch: "epoch-1",
    }) });
    expect(read.mock.calls[0]![0]).toContain("scope=all");
    await mount({ actor: { id: "mod-1", role: "MODERATOR" }, getCurrentSession: () => ({
      actor: { id: "mod-1", role: "MODERATOR" }, token: "opaque", authEpoch: "epoch-1",
    }) });
    expect(host.textContent).not.toContain("Курс послушания");
    expect(host.textContent).toContain("Сводка доступна");
  });
  it("does not show data if denied or session retired", async () => {
    deny = true;
    await mount();
    expect(host.textContent).toContain("Нет доступа");
    expect(host.textContent).not.toContain("Курс послушания");
    await mount({ getCurrentSession: () => null });
    expect(host.textContent).not.toContain("Курс послушания");
  });
});
