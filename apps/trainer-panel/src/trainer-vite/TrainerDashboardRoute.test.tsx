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
  inProgressUsers: 1, notStartedUsers: 4,
};
const otherCourse = { ...course, id: "course-2", name: "Второй курс",
  totalUsers: 0, completedUsers: 0, inProgressUsers: 0, notStartedUsers: 7 };
const snapshot = {
  id: course.id, version: 3, name: course.name,
  guideContent: null, shortDesc: "", description: "", duration: "30 дней",
  videoUrl: null, logoImg: "", isPrivate: false, isPaid: false,
  showInProfile: true, isPersonalized: false, equipment: "",
  trainingLevel: "BEGINNER", dayLinks: [], access: [],
};
const ready = (courses = [course, otherCourse]) => ({ status: 200, headers,
  body: { success: true, data: { courses, totalCourses: courses.length, totalDays: 4 } },
});
let mockCourses = [course, otherCourse];
let deleted = false;
let deny = false;
let stale = false;
let invalidDeleteReceipt = false;
let read: ReturnType<typeof vi.fn>;
let write: ReturnType<typeof vi.fn>;
let host: HTMLDivElement;
let root: Root;
const current = () => ({ actor, token: "opaque", authEpoch: "epoch-1" });
async function mount(props: Partial<Parameters<typeof TrainerDashboardRoute>[0]> = {}) {
  await act(async () => root.render(createElement(TrainerDashboardRoute, {
    actor, token: "opaque", authEpoch: "epoch-1", fetchRead: read,
    courseWriteTransport: write, getCurrentSession: current, ...props,
  })));
}
const deleteButton = () => host.querySelector<HTMLButtonElement>(
  ".trainer-overview-delete",
);
async function deleteFirst() {
  await act(async () => deleteButton()?.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mockCourses = [course, otherCourse];
  deleted = false; deny = false; stale = false; invalidDeleteReceipt = false;
  read = vi.fn(async (path: string) => {
    if (path.includes("/statistics/courses")) return deny ? {
      status: 403, headers, body: { success: false },
    } : ready(mockCourses);
    if (path.includes("/editor-snapshot")) return deleted ? {
      status: 404, headers, body: { success: false },
    } : { status: 200, headers, body: { success: true, data: snapshot } };
    throw Error("UNEXPECTED_READ_ENDPOINT");
  });
  write = vi.fn(async () => {
    if (stale) return { status: 409, headers, body: { success: false } };
    if (!invalidDeleteReceipt) {
      deleted = true; mockCourses = mockCourses.filter(item => item.id !== course.id);
    }
    return { status: 200, headers, body: invalidDeleteReceipt
      ? { success: true, data: { id: "wrong-id" } }
      : { success: true, data: { id: course.id } } };
  });
  vi.stubGlobal("confirm", vi.fn(() => true));
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.unstubAllGlobals();
});

describe("trainer overview: focused course library", () => {
  it("shows only courses, actual starts (not 6 enrolled), and both visible actions", async () => {
    await mount();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]![0]).toBe("/api/v1/trainer/statistics/courses?scope=own");
    expect(host.querySelectorAll(".trainer-overview-card")).toHaveLength(2);
    expect(host.textContent).toContain("Курс послушания");
    expect(host.textContent).toContain("Курс начали: 2 человека");
    expect(host.textContent).toContain("Курс начали: 0 человек");
    expect(host.querySelector<HTMLAnchorElement>(
      'a[href="/courses/course-1/edit"]')?.textContent?.trim()).toBe("Редактировать курс");
    expect(deleteButton()?.textContent).toBe("Удалить курс");
    expect(host.textContent).not.toContain("Создать шаг");
    expect(host.textContent).not.toContain("Создать курс");
    expect(host.textContent).not.toContain("Дней:");
    expect(host.textContent).not.toContain("Экзамены");
    expect(write).not.toHaveBeenCalled();
  });
  it("renders real course logo and public access type, with fallback for missing images", async () => {
    mockCourses = [{ ...course, logoImg: "https://cdn.example.org/course-cover.webp" },
      { ...otherCourse, logoImg: "" }];
    await mount();
    const cards = host.querySelectorAll(".trainer-overview-card");
    expect(cards).toHaveLength(2);
    const logo = cards[0]?.querySelector<HTMLImageElement>(".trainer-overview-course-icon img");
    expect(logo?.getAttribute("src")).toBe("https://cdn.example.org/course-cover.webp");
    expect(logo?.getAttribute("alt")).toBe("Обложка курса «Курс послушания»");
    expect(logo?.getAttribute("loading")).toBe("lazy");
    expect(cards[0]?.querySelector(".trainer-overview-course-type")?.textContent?.trim())
      .toBe("Публичный");
    expect(cards[1]?.querySelector(".trainer-overview-course-icon span")?.textContent?.trim())
      .toBe("В");
    await act(async () => logo?.dispatchEvent(new Event("error")));
    expect(cards[0]?.querySelector(".trainer-overview-course-icon img")).toBeNull();
    expect(cards[0]?.querySelector(".trainer-overview-course-icon span")?.textContent?.trim())
      .toBe("К");
  });
  it("labels subscription and private types and rejects unsafe logo URLs", async () => {
    mockCourses = [
      { ...course, isPaid: true, isPrivate: false, logoImg: "javascript:alert(1)" },
      { ...otherCourse, isPrivate: true, isPaid: false,
        logoImg: "https://name:password@cdn.example.org/secret.webp" },
    ];
    await mount();
    const cards = host.querySelectorAll(".trainer-overview-card");
    expect(cards[0]?.querySelector(".trainer-overview-course-type")?.textContent?.trim())
      .toBe("По подписке");
    expect(cards[1]?.querySelector(".trainer-overview-course-type")?.textContent?.trim())
      .toBe("Приватный");
    expect(host.querySelectorAll(".trainer-overview-course-icon img")).toHaveLength(0);
    expect(host.querySelectorAll(".trainer-overview-course-icon span")).toHaveLength(2);
  });
  it("admin requests all, moderator and retired sessions see no courses or delete", async () => {
    const admin = { id: "admin-1", role: "ADMIN" as const };
    await mount({ actor: admin, getCurrentSession: () => ({
      actor: admin, token: "opaque", authEpoch: "epoch-1",
    }) });
    expect(read.mock.calls[0]![0]).toContain("scope=all");
    expect(host.textContent).toContain("Все курсы");
    const mod = { id: "mod-1", role: "MODERATOR" as const };
    await mount({ actor: mod, getCurrentSession: () => ({
      actor: mod, token: "opaque", authEpoch: "epoch-1",
    }) });
    expect(host.textContent).not.toContain("Курс послушания");
    expect(host.textContent).toContain("Список доступен");
    await mount({ getCurrentSession: () => null });
    expect(host.querySelectorAll(".trainer-overview-delete")).toHaveLength(0);
  });
  it("does not show courses on an explicit denied response or unsafe statistics", async () => {
    deny = true;
    await mount();
    expect(host.textContent).toContain("Нет доступа");
    expect(host.textContent).not.toContain("Курс послушания");
    deny = false;
    read.mockImplementation(async () => ({ ...ready(), headers: { "cache-control": "public" } }));
    await mount({ fetchRead: read });
    // The same dependency cannot force a reload; mount at a new auth epoch.
    await mount({ authEpoch: "epoch-2", getCurrentSession: () => ({
      actor, token: "opaque", authEpoch: "epoch-2",
    }) });
    expect(host.textContent).toContain("Не удалось загрузить курсы");
    expect(host.textContent).not.toContain("Курс послушания");
  });
  it("cancel confirmation leaves course and student progress untouched", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    await mount();
    await deleteFirst();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("прогресс и отзывы"));
    expect(write).not.toHaveBeenCalled();
    expect(host.querySelectorAll(".trainer-overview-card")).toHaveLength(2);
  });
  it("deletes with snapshot version, confirms 404 and reloads the scoped courses", async () => {
    await mount();
    await deleteFirst();
    expect(read.mock.calls.map(call => call[0])).toEqual([
      "/api/v1/trainer/statistics/courses?scope=own",
      "/api/v1/trainer/courses/course-1/editor-snapshot",
      "/api/v1/trainer/courses/course-1/editor-snapshot",
      "/api/v1/trainer/statistics/courses?scope=own",
    ]);
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      method: "DELETE", path: "/api/v1/trainer/courses/manage/course-1",
      body: { expectedVersion: 3 },
    }));
    expect(host.textContent).toContain("Курс «Курс послушания» удалён");
    expect(host.textContent).not.toContain("Курс послушанияРедактировать");
    expect(host.querySelectorAll(".trainer-overview-card")).toHaveLength(1);
    expect(host.textContent).toContain("Второй курс");
  });
  it("stale version or invalid response never confirms course deletion", async () => {
    stale = true;
    await mount();
    await deleteFirst();
    expect(host.textContent).toContain("изменился. Обновите список");
    expect(host.querySelectorAll(".trainer-overview-card")).toHaveLength(2);
    stale = false;
    invalidDeleteReceipt = true;
    await deleteFirst();
    expect(host.textContent).toContain("Удаление не подтверждено");
    expect(host.querySelectorAll(".trainer-overview-card")).toHaveLength(2);
  });
});
