// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TrainerContentEditorRoute, type TrainerContentWriteTransport,
} from "./TrainerContentEditorRoute";

const actor = { id: "trainer-1", role: "TRAINER" as const };
const id = "step_1";
const dayId = "day_1";
const headers = { "cache-control": "private, no-store" };
const step = {
  id, title: "Сидеть", description: "Описание упражнения сидеть",
  type: "TRAINING", durationSec: 120, estimatedDurationSec: null,
  videoUrl: null, imageUrls: [], pdfUrls: [], checklist: [],
  requiresVideoReport: false, requiresWrittenFeedback: false,
  hasTestQuestions: false, isDailyCourse: false, surveySlug: null,
};
const day = {
  id: dayId, title: "Мой первый день", description: "Описание дня",
  type: "regular", equipment: "", showCoursePathExport: false,
  shareProgressAcrossCourses: false, stepIds: [id],
};
let stored: typeof step | typeof day | null;
let denied: boolean;
let stale: boolean;
const read = vi.fn(async () => ({
  status: denied ? 403 : stored ? 200 : 404,
  headers, body: stored ? { success: true, data: stored } : { success: false },
}));
const write = vi.fn(async (req: Parameters<TrainerContentWriteTransport>[0]) => {
  if (!stale) {
    if (req.method === "DELETE") stored = null;
    else stored = { ...stored, ...req.body as object } as typeof day;
  }
  return { status: 200, headers, body: { success: true } };
});
let root: Root;
let host: HTMLDivElement;
const current = () => ({ actor, token: "opaque", authEpoch: "epoch-1" });
async function mount(kind: "step" | "day" = "step", props: Partial<
  Parameters<typeof TrainerContentEditorRoute>[0]> = {}) {
  await act(async () => root.render(createElement(TrainerContentEditorRoute, {
    pathname: "/main-panel/" + (kind === "step" ? "steps/" + id : "days/" + dayId) +
      "/edit", actor, token: "opaque", authEpoch: "epoch-1", enabled: true,
    contentReadTransport: read, contentWriteTransport: write,
    getCurrentSession: current, ...props,
  })));
}
async function changeTitle(value: string) {
  const input = host.querySelector<HTMLInputElement>("form input")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => host.querySelector<HTMLFormElement>("form")!.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true })));
}
async function clickDelete() {
  const button = [...host.querySelectorAll("button")].find(x => x.textContent === "Удалить");
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  stored = { ...step }; denied = false; stale = false;
  host = document.createElement("div");
  document.body.append(host); root = createRoot(host);
  read.mockClear(); write.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.restoreAllMocks();
});
describe("owner-scoped trainer step/day Vite editor", () => {
  it("loads and edits a step with full fields and verifies changed server title", async () => {
    await mount();
    expect(host.textContent).toContain("Редактирование шага");
    await changeTitle("Новая команда");
    await submit();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "PUT", path: "/api/v1/trainer/steps/manage/" + id,
      body: { title: "Новая команда", type: "TRAINING", imageUrls: [] },
    });
    expect(read.mock.calls.length).toBeGreaterThan(1);
    expect(host.textContent).toContain("подтверждены повторным чтением");
  });
  it("loads and saves day with explicit ordered step IDs", async () => {
    stored = { ...day };
    await mount("day");
    await changeTitle("День послушания");
    await submit();
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "PUT", path: "/api/v1/trainer/days/manage/" + dayId,
      body: { title: "День послушания", stepIds: [id] },
    });
    expect(host.textContent).toContain("подтверждены");
  });
  it("requires deletion confirmation and readback 404", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    await clickDelete();
    expect(write).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await clickDelete();
    expect(write).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Удаление подтверждено");
    expect(host.querySelector('a[href="/main-panel/steps"]')).toBeTruthy();
  });
  it("does not claim success for stale readback or a retired actor", async () => {
    stale = true;
    await mount();
    await changeTitle("Новое имя");
    await submit();
    expect(write).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Основные поля подтверждены");
    await mount("step", { getCurrentSession: () => null });
    expect(host.textContent).toContain("недоступно");
    expect(host.textContent).not.toContain("Новое имя");
  });
  it("blocks foreign/denied read without exposing previous editor data", async () => {
    denied = true;
    await mount();
    expect(host.textContent).toContain("Нет доступа");
    expect(host.textContent).not.toContain("Сидеть");
    expect(write).not.toHaveBeenCalled();
  });
});
