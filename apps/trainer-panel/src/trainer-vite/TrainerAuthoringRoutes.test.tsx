// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerOptInRoute } from "./optInRoute";
import type { TrainerAuthoringTransport } from "./trainerAuthoringClient";

const actor = { id: "trainer-a", role: "TRAINER" as const };
const cc = { "cache-control": "private, no-store" };
let host: HTMLDivElement;
let root: Root;
const post = vi.fn(async (_request: Parameters<TrainerAuthoringTransport>[0]): Promise<{
  status: number; headers: Record<string, string>; body: unknown;
}> => ({
  status: 201, headers: cc, body: { success: true, data: { id: "new-id" } },
}));
const step = {
  id: "step-1", title: "Держать внимание", description: "Описание шага с деталями",
  durationSec: 90, estimatedDurationSec: null, type: "TRAINING", videoUrl: null,
  imageUrls: [], pdfUrls: [], checklist: null, surveySlug: null,
  isDailyCourse: false, authorId: actor.id, createdAt: "2026-10-25T11:00:00.000Z",
  updatedAt: "2026-10-25T11:00:00.000Z", author: { username: "trainer", profile: null },
  stepLinks: [],
};
const get = vi.fn(async (_request: { method: "GET"; path: string; signal: AbortSignal }) => ({
  status: 200, headers: cc, body: { success: true, data: [step] },
}));
const day = {
  id: "own-day-A", title: "Команда сидеть", equipment: "Поводок",
  description: "Описание", type: "regular", authorId: actor.id,
  showCoursePathExport: false, shareProgressAcrossCourses: false,
  createdAt: "2026-10-25T10:00:00.000Z", updatedAt: "2026-10-25T10:00:00.000Z",
  author: { username: "trainer", profile: null }, stepLinks: [], dayLinks: [],
};
const getDays = vi.fn(async (_path: string, _signal: AbortSignal) => ({
  status: 200, headers: cc, body: { success: true, data: [day] },
}));
type P = Parameters<typeof TrainerOptInRoute>[0];
async function mount(override: Partial<P> & Pick<P, "pathname">) {
  const props: P = {
    actor, token: "local-test", authEpoch: "session-1", fetchImpl: fetch,
    enableAuthoring: true, authoringTransport: post, visibleStepsTransport: get,
    visibleDaysTransport: getDays,
    ...override,
  };
  await act(async () => root.render(createElement(TrainerOptInRoute, props)));
}
async function change(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
    HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  post.mockClear(); get.mockClear(); getDays.mockClear();
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("Trainer Vite opt-in step/day POST forms", () => {
  it("requires staff session and explicit writer; old actor never gets a form", async () => {
    await mount({ pathname: "/main-panel/steps/new", enableAuthoring: false });
    expect(host.textContent).toContain("недоступно");
    expect(host.querySelector("form")).toBeNull();
    await mount({ pathname: "/main-panel/steps/new", getCurrentSession: () => null });
    expect(host.querySelector("form")).toBeNull();
    await mount({ pathname: "/main-panel/days/new", actor: { id: "mod", role: "MODERATOR" } });
    expect(host.querySelector("form")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
  it("creates ordinary training step by POST; no second submit after confirmed success", async () => {
    await mount({ pathname: "/main-panel/steps/new" });
    await change(host.querySelector("input[required]")!, "Обучение фокусу");
    await change(host.querySelector("textarea[required]")!, "Описание шага и последовательности действий");
    await submit();
    expect(post).toHaveBeenCalledTimes(1);
    const request = post.mock.calls[0]![0];
    expect(request).toMatchObject({ method: "POST", path: "/api/v1/trainer/authoring/steps" });
    expect(request.body).toMatchObject({
      title: "Обучение фокусу", type: "TRAINING", durationSec: 90,
      imageUrls: [], isDailyCourse: false,
    });
    expect(host.textContent).toContain("Шаг создан");
    await submit();
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("steps/new saves the selected My Videos link through the existing authoring API", async () => {
    const url = "https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer-a/videocourses/own-video/source.mp4";
    const videos = vi.fn(async () => ({ status: 200, headers: cc, body: { success: true,
      data: { videos: [{ id: "own-video", title: "Готовое видео", videoUrl: url,
        durationSec: 63, createdAt: "2026-11-03T10:00:00.000Z" }] } },
    }));
    await mount({ pathname: "/main-panel/steps/new", videoMetadataTransport: videos });
    const mode = [...host.querySelectorAll("button")]
      .find(button => button.textContent === "Мои видео")!;
    await act(async () => mode.click());
    expect(videos).toHaveBeenCalledTimes(1);
    await act(async () => host.querySelector<HTMLButtonElement>(
      ".trainer-video-selector-grid button")!.click());
    await change(host.querySelector("input[required]")!, "Первый урок с видео");
    await change(host.querySelector("textarea[required]")!, "Описание упражнения с видео");
    await submit();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST", path: "/api/v1/trainer/authoring/steps",
      body: expect.objectContaining({ videoUrl: url }),
    }));
    expect(host.textContent).toContain("Шаг создан");
  });
  it("steps/new attaches two My Videos clips in the chosen order without losing the first-video alias", async () => {
    const urls = ["video-a", "video-b"].map(id =>
      `https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer-a/videocourses/${id}/original.mp4`);
    const videos = vi.fn(async () => ({ status: 200, headers: cc, body: { success: true,
      data: { videos: urls.map((videoUrl, index) => ({
        id: `video-${index === 0 ? "a" : "b"}`, title: `Видео ${index + 1}`,
        videoUrl, durationSec: 63, createdAt: "2026-11-03T10:00:00.000Z",
      })) } },
    }));
    await mount({ pathname: "/main-panel/steps/new", videoMetadataTransport: videos });
    await act(async () => [...host.querySelectorAll("button")]
      .find(button => button.textContent === "Мои видео")!.click());
    const tiles = [...host.querySelectorAll<HTMLButtonElement>(
      ".trainer-video-selector-grid button")];
    await act(async () => tiles[0]!.click());
    await act(async () => tiles[1]!.click());
    await act(async () => host.querySelector<HTMLButtonElement>(
      '[aria-label="Переместить видео 2 вверх"]')!.click());
    await change(host.querySelector("input[required]")!, "Курс с двумя видео");
    await change(host.querySelector("textarea[required]")!, "Описание курса с двумя полезными видео");
    await submit();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST", path: "/api/v1/trainer/authoring/steps",
      body: expect.objectContaining({ videoUrl: urls[1], videoUrls: [urls[1], urls[0]] }),
    }));
    expect(host.textContent).toContain("Шаг создан");
  });
  it("days/new loads own steps from real read adapter; submits only selected step IDs", async () => {
    await mount({ pathname: "/main-panel/days/new", search: "?stepIds=step-1" });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]![0]).toMatchObject({
      method: "GET", path: "/api/v1/trainer/steps?isDailyCourse=false",
    });
    expect(host.textContent).toContain("Держать внимание");
    expect(host.querySelector("ol[aria-label=\"Порядок выбранных шагов\"]")).not.toBeNull();
    await change(host.querySelector("input[required]")!, "Первый тренировочный день");
    await submit();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toMatchObject({
      method: "POST", path: "/api/v1/trainer/authoring/days",
      body: { title: "Первый тренировочный день", stepIds: ["step-1"] },
    });
    expect(host.textContent).toContain("День создан");
  });
  it("days/new adds repeated steps, reorders the occurrences and posts the exact sequence", async () => {
    const second = { ...step, id: "step-2", title: "Закрепляем команду",
      createdAt: "2026-10-25T10:00:00.000Z", updatedAt: "2026-10-25T10:00:00.000Z" };
    get.mockResolvedValueOnce({ status: 200, headers: cc,
      body: { success: true, data: [step, second] } });
    await mount({ pathname: "/main-panel/days/new" });
    const click = async (label: string) => {
      const target = [...host.querySelectorAll("button")]
        .find(element => element.getAttribute("aria-label") === label);
      expect(target).toBeTruthy();
      await act(async () => target!.click());
    };
    await click("Добавить шаг: Держать внимание");
    await click("Добавить шаг: Держать внимание");
    await click("Добавить шаг: Закрепляем команду");
    await click("Переместить выше: Закрепляем команду, позиция 3");
    expect([...host.querySelectorAll<HTMLElement>(".trainer-day-selected-row")]
      .map(row => row.dataset.stepId)).toEqual(["step-1", "step-2", "step-1"]);
    await change(host.querySelector("input[required]")!, "День с повторами");
    await submit();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST", path: "/api/v1/trainer/authoring/days",
      body: expect.objectContaining({ stepIds: ["step-1", "step-2", "step-1"] }),
    }));
    expect(host.textContent).toContain("День создан");
  });
  it("creates free public course with selected owned days through registered authoring path", async () => {
    await mount({ pathname: "/main-panel/courses/new" });
    expect(getDays).toHaveBeenCalledTimes(1);
    expect(getDays.mock.calls[0]![0]).toBe("/api/v1/trainer/days");
    expect(host.textContent).toContain("Создание нового курса");
    const inputs = host.querySelectorAll<HTMLInputElement>("input[required]");
    expect(inputs).toHaveLength(2);
    await change(inputs[0]!, "Обучение командам");
    await change(inputs[1]!, "14 дней");
    const checkbox = host.querySelector(
      "fieldset input[type=\"checkbox\"]") as HTMLInputElement;
    await act(async () => checkbox.click());
    await submit();
    expect(post).toHaveBeenCalledTimes(1);
    const request = post.mock.calls[0]![0];
    expect(request.path).toBe("/api/v1/trainer/authoring/courses");
    expect(request.body).toMatchObject({
      name: "Обучение командам", duration: "14 дней", isPublic: true, isPaid: false,
      logoImg: "", videoUrl: null, allowedUsers: [], trainingDays: ["own-day-A"],
    });
    expect(host.textContent).toContain("Курс создан");
  });
  it("no trainer course creation with revoked session or disabled authoring", async () => {
    await mount({ pathname: "/main-panel/courses/new", getCurrentSession: () => null });
    expect(host.querySelector("form")).toBeNull();
    await mount({ pathname: "/main-panel/courses/new", enableAuthoring: false });
    expect(host.querySelector("[data-trainer-create-course]")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("articles/new generates Next-compatible Cyrillic slug and writes subscriber-only article", async () => {
    await mount({ pathname: "/main-panel/articles/new" });
    expect(host.textContent).toContain("Создать статью");
    const title = host.querySelector("input[required]") as HTMLInputElement;
    const content = host.querySelector("textarea[required]") as HTMLTextAreaElement;
    const description = host.querySelectorAll("textarea[required]")[1] as HTMLTextAreaElement;
    await change(title, "Учимся команде сидеть");
    await change(content, "<h2>Садимся по команде</h2>");
    await change(description, "Тренировки дома и на улице");
    await submit();
    expect(post).toHaveBeenCalledTimes(1);
    const request = post.mock.calls[0]![0];
    expect(request.path).toBe("/api/v1/trainer/authoring/articles");
    expect(request.body).toMatchObject({
      title: "Учимся команде сидеть", slug: "uchimsya-komande-sidet",
      visibility: "PAID", contentType: "HTML",
      description: "Тренировки дома и на улице", imageUrls: [],
    });
    expect(host.textContent).toContain("Статья создана");
    await submit();
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("article create form denies moderators and retired principals, no writes", async () => {
    await mount({ pathname: "/main-panel/articles/new", getCurrentSession: () => null });
    expect(host.querySelector("form")).toBeNull();
    await mount({ pathname: "/main-panel/articles/new",
      actor: { id: "moderator", role: "MODERATOR" } });
    expect(host.querySelector("form")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("does not claim success on 500 or unsafe cache headers", async () => {
    post.mockResolvedValueOnce({ status: 500, headers: cc,
      body: { success: false, code: "INTERNAL_SERVER_ERROR" } });
    await mount({ pathname: "/main-panel/steps/new" });
    await change(host.querySelector("input[required]")!, "Обучение фокусу");
    await change(host.querySelector("textarea[required]")!, "Описание шага и последовательности действий");
    await submit();
    expect(host.textContent).toContain("Сохранение не удалось");
    expect(host.textContent).not.toContain("Шаг создан");
    post.mockResolvedValueOnce({ status: 201, headers: { "cache-control": "public" },
      body: { success: true, data: { id: "fake" } } });
    await submit();
    expect(host.textContent).toContain("Ошибка сети или ответа сервера");
    expect(host.textContent).not.toContain("Шаг создан");
  });
});
