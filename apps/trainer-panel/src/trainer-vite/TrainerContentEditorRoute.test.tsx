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
const visibleStep = (stepId: string, title: string) => ({
  id: stepId, title, description: "Описание шага", durationSec: 120,
  estimatedDurationSec: null, type: "TRAINING", videoUrl: null,
  imageUrls: [], pdfUrls: [], checklist: null, surveySlug: null,
  isDailyCourse: false, authorId: actor.id,
  createdAt: "2026-10-25T11:00:00.000Z", updatedAt: "2026-10-25T11:00:00.000Z",
  author: { username: "trainer", profile: null }, stepLinks: [],
});
const read = vi.fn(async (path: string) => path === "/api/v1/trainer/steps?isDailyCourse=false"
  ? { status: denied ? 403 : 200, headers,
    body: { success: true, data: [visibleStep(id, "Сидеть"),
      visibleStep("step_2", "Лежать")] } }
  : {
    status: denied ? 403 : stored ? 200 : 404,
    headers, body: stored ? { success: true, data: stored } : { success: false },
  });
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
  it("step editor selects a ready video and confirms the saved URL by GET", async () => {
    const url = "https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer-1/videocourses/video-1/a.mp4";
    const videoRead = vi.fn(async () => ({ status: 200, headers,
      body: { success: true, data: { videos: [
        {id: "video-1", title: "Моя запись", durationSec: 33,
          createdAt: "2026-11-03T10:00:00.000Z", videoUrl: url},
      ] } },
    }));
    await mount("step", { videoMetadataTransport: videoRead });
    await act(async () => [...host.querySelectorAll("button")]
      .find(button => button.textContent === "Мои видео")!.click());
    await act(async () => host.querySelector<HTMLButtonElement>(
      ".trainer-video-selector-grid button")!.click());
    await submit();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT",
      body: expect.objectContaining({ videoUrl: url }),
    }));
    expect(host.textContent).toContain("подтверждены повторным чтением");
  });
  it("step editor saves several video URLs in exact order and confirms them on readback", async () => {
    const urls = ["clip-a", "clip-b"].map(video =>
      `https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer-1/videocourses/${video}/original.mp4`);
    const videoRead = vi.fn(async () => ({ status: 200, headers,
      body: { success: true, data: { videos: urls.map((url, index) => ({
        id: `clip-${index === 0 ? "a" : "b"}`, title: `Видео ${index + 1}`,
        durationSec: 42, createdAt: "2026-11-03T10:00:00.000Z", videoUrl: url,
      })) } },
    }));
    await mount("step", { videoMetadataTransport: videoRead });
    await act(async () => [...host.querySelectorAll("button")]
      .find(button => button.textContent === "Мои видео")!.click());
    const tiles = [...host.querySelectorAll<HTMLButtonElement>(
      ".trainer-video-selector-grid button")];
    await act(async () => tiles[0]!.click());
    await act(async () => tiles[1]!.click());
    await act(async () => host.querySelector<HTMLButtonElement>(
      '[aria-label="Переместить видео 2 вверх"]')!.click());
    await submit();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      method: "PUT", body: expect.objectContaining({
        videoUrl: urls[1], videoUrls: [urls[1], urls[0]],
      }),
    }));
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
  it("day editor adds repeats, reorders and verifies the exact server step sequence", async () => {
    stored = { ...day };
    await mount("day");
    const click = async (label: string) => {
      const button = [...host.querySelectorAll("button")]
        .find(element => element.getAttribute("aria-label") === label);
      expect(button).toBeTruthy();
      await act(async () => button!.click());
    };
    await click("Добавить шаг: Сидеть");
    await click("Добавить шаг: Лежать");
    await click("Переместить выше: Лежать, позиция 3");
    expect([...host.querySelectorAll<HTMLElement>(".trainer-day-selected-row")]
      .map(row => row.dataset.stepId)).toEqual([id, "step_2", id]);
    await submit();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      method: "PUT", body: expect.objectContaining({ stepIds: [id, "step_2", id] }),
    }));
    expect(host.textContent).toContain("порядок шагов подтверждены");
    expect([...host.querySelectorAll<HTMLElement>(".trainer-day-selected-row")]
      .map(row => row.dataset.stepId)).toEqual([id, "step_2", id]);
  });
  it("never confirms a day update if readback has lost or reordered repeated steps", async () => {
    stored = { ...day };
    await mount("day");
    const add = [...host.querySelectorAll("button")]
      .find(element => element.getAttribute("aria-label") === "Добавить шаг: Сидеть");
    expect(add).toBeTruthy();
    await act(async () => add!.click());
    write.mockImplementationOnce(async () => ({ status: 200, headers,
      body: { success: true } })); // simulate backend acknowledgement without storing repeat
    await submit();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      method: "PUT", body: expect.objectContaining({ stepIds: [id, id] }),
    }));
    expect(host.textContent).toContain("Операция не подтверждена");
    expect(host.textContent).not.toContain("порядок шагов подтверждены");
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
