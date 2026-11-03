// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TrainerFullCourseEditorRoute, type TrainerFullCourseWriteTransport,
} from "./TrainerFullCourseEditorRoute";

const actor = { id: "trainer_A", role: "TRAINER" as const };
const id = "course_1";
const headers = { "cache-control": "private, no-store" };
const initial = {
  id, name: "Первый курс", version: 4,
  guideContent: null, shortDesc: "Краткий текст", description: "Описание",
  duration: "7 дней", videoUrl: null, logoImg: "",
  isPrivate: false, isPaid: false, showInProfile: true, isPersonalized: false,
  equipment: "", trainingLevel: "BEGINNER" as const,
  dayLinks: [{
    id: "link-1", dayId: "day-1", order: 1, day: { id: "day-1", title: "День первый" },
  }],
  access: [],
};
type Snapshot = typeof initial & { version: number; name: string; duration: string };
let stored: Snapshot;
let stale: boolean;
let denied: boolean;
let deleted: boolean;
const availableDay = (dayId: string, title: string) => ({
  id: dayId, title, equipment: "", description: "", type: "regular",
  authorId: actor.id, showCoursePathExport: false, shareProgressAcrossCourses: false,
  createdAt: "2026-10-25T09:00:00.000Z", updatedAt: "2026-10-25T09:00:00.000Z",
  author: { username: "trainer_A", profile: null }, stepLinks: [], dayLinks: [],
});
const read = vi.fn(async (path: string) => ({
  status: denied ? 403 : deleted ? 404 : 200,
  headers, body: deleted ? { success: false } : path === "/api/v1/trainer/days"
    ? { success: true, data: [availableDay("day-1", "День первый"),
      availableDay("day-2", "День второй")] }
    : { success: true, data: stored },
}));
const write = vi.fn(async (req: Parameters<TrainerFullCourseWriteTransport>[0]) => {
  const body = req.body as {
    expectedVersion: number; name: string; duration: string; trainingDays: string[];
  };
  if (req.method === "DELETE") {
    if (!stale) deleted = true;
    return { status: stale ? 409 : 200, headers,
      body: { success: !stale, data: { id } } };
  }
  if (!stale) stored = {
    ...stored, name: body.name, duration: body.duration, version: body.expectedVersion + 1,
    dayLinks: body.trainingDays.map((dayId, index) => ({
      id: "link-" + index, dayId, order: index + 1,
      day: { id: dayId, title: dayId === "day-1" ? "День первый" : "День второй" },
    })),
  };
  if (req.method === "POST") return {
    status: 201, headers, body: { success: true,
      data: { id: "123e4567-e89b-42d3-a456-426614174000" } },
  };
  return { status: stale ? 409 : 200, headers, body: stale ? { success: false,
    code: "STALE_VERSION" } : {
    success: true, data: { id, version: body.expectedVersion + 1 },
  } };
});
let host: HTMLDivElement;
let root: Root;
const session = () => ({ actor, token: "opaque", authEpoch: "epoch-1" });
async function mount(props: Partial<Parameters<typeof TrainerFullCourseEditorRoute>[0]> = {}) {
  await act(async () => root.render(createElement(TrainerFullCourseEditorRoute, {
    pathname: "/main-panel/courses/" + id + "/edit",
    actor, token: "opaque", authEpoch: "epoch-1", enabled: true,
    courseReadTransport: read, courseWriteTransport: write,
    getCurrentSession: session, ...props,
  })));
}
async function updateFirstInput(value: string) {
  const element = host.querySelector<HTMLInputElement>("form input")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function save() {
  await act(async () => host.querySelector<HTMLFormElement>("form")!.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true })));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  stored = { ...initial }; stale = false; denied = false; deleted = false;
  read.mockClear(); write.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.restoreAllMocks();
});
describe("full trainer course CAS editor", () => {
  it("creates a course in live Vite with full form and links to editor", async () => {
    await mount({ pathname: "/main-panel/courses/new" });
    expect(host.textContent).toContain("Создание нового курса");
    expect(read).toHaveBeenCalledWith("/api/v1/trainer/days", expect.any(AbortSignal));
    await updateFirstInput("Новая программа");
    const duration = [...host.querySelectorAll("label")]
      .find(label => label.textContent?.includes("Длительность"))
      ?.querySelector<HTMLInputElement>("input");
    expect(duration).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(duration!, "10 дней");
      duration!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await save();
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "POST", path: "/api/v1/trainer/courses/manage",
      body: { name: "Новая программа", isPublic: true, isPaid: false },
    });
    expect((write.mock.calls[0]![0].body as Record<string, unknown>).expectedVersion)
      .toBeUndefined();
    expect(host.textContent).toContain("Курс создан");
    expect(host.querySelector(
      'a[href="/main-panel/courses/123e4567-e89b-42d3-a456-426614174000/edit"]'))
      .toBeTruthy();
  });
  it("loads coherent snapshot and writes all editable fields with exact revision", async () => {
    await mount();
    expect(host.textContent).toContain("Версия: 4");
    await updateFirstInput("Обновлённый курс");
    await save();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "PUT", path: "/api/v1/trainer/courses/manage/" + id,
      body: {
        name: "Обновлённый курс", expectedVersion: 4, trainingDays: ["day-1"],
        allowedUsers: [], isPublic: true, isPaid: false,
      },
    });
    expect(read.mock.calls.length).toBeGreaterThan(1);
    expect(host.textContent).toContain("Версия: 5");
    expect(host.textContent).toContain("Курс сохранён");
  });
  it("repeats days, reorders them and persists exact sequence through server readback", async () => {
    await mount();
    const click = async (label: string) => {
      const button = Array.from(host.querySelectorAll("button"))
        .find(element => element.getAttribute("aria-label") === label);
      expect(button).toBeTruthy();
      await act(async () => button!.click());
    };
    await click("Добавить день: День первый");
    await click("Добавить день: День второй");
    let selected = host.querySelectorAll<HTMLElement>(".trainer-day-selected-row");
    expect([...selected].map(row => row.dataset.dayId))
      .toEqual(["day-1", "day-1", "day-2"]);
    await click("Переместить выше: День второй, позиция 3");
    selected = host.querySelectorAll(".trainer-day-selected-row");
    expect([...selected].map(row => row.dataset.dayId))
      .toEqual(["day-1", "day-2", "day-1"]);
    await save();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      method: "PUT", body: expect.objectContaining({
        trainingDays: ["day-1", "day-2", "day-1"],
      }),
    }));
    expect(host.textContent).toContain("Курс сохранён");
    expect([...host.querySelectorAll<HTMLElement>(".trainer-day-selected-row")]
      .map(row => row.dataset.dayId)).toEqual(["day-1", "day-2", "day-1"]);
  });
  it("409 does not auto-resend or destroy unsaved edits", async () => {
    stale = true;
    await mount();
    await updateFirstInput("Мой черновик");
    await save();
    expect(write).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Конфликт версии");
    const input = host.querySelector<HTMLInputElement>("form input")!;
    expect(input.value).toBe("Мой черновик");
    expect(host.textContent).not.toContain("Курс сохранён");
    expect(host.textContent).toContain("Загрузить актуальную версию");
  });
  it("fails closed on denied JWT and session retirement", async () => {
    denied = true;
    await mount();
    expect(host.textContent).toContain("Доступ к курсу запрещён");
    expect(host.textContent).not.toContain(initial.name);
    await mount({ getCurrentSession: () => null });
    expect(host.textContent).toContain("недоступен");
    expect(write).not.toHaveBeenCalled();
  });
  it("only deletes course after explicit confirmation and server GET 404", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    const button = Array.from(host.querySelectorAll("button"))
      .find(item => item.textContent === "Удалить курс");
    expect(button).toBeTruthy();
    await act(async () => button!.click());
    expect(write).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => button!.click());
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "DELETE", path: "/api/v1/trainer/courses/manage/" + id,
      body: { expectedVersion: 4 },
    });
    expect(host.textContent).toContain("Удаление курса подтверждено");
    expect(read.mock.calls.length).toBeGreaterThan(1);
  });
  it("refuses to save an unsafe logo URL before contacting Hono", async () => {
    await mount();
    const logo = [...host.querySelectorAll("label")]
      .find(label => label.textContent?.includes("URL обложки"))
      ?.querySelector<HTMLInputElement>("input");
    expect(logo).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(logo!, "javascript:alert(1)");
      logo!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await save();
    expect(write).not.toHaveBeenCalled();
  });
});
