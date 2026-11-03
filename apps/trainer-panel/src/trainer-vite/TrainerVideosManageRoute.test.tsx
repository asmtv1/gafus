// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TrainerVideosManageRoute, type TrainerVideoManageTransport,
} from "./TrainerVideosManageRoute";

const actor = { id: "trainer-1", role: "TRAINER" as const };
const headers = { "cache-control": "private, no-store" };
const sample = {
  id: "video-1", displayName: "Начальный урок",
  originalName: "original-dog-course.mp4", fileSize: 2_097_152,
  hasThumbnail: true, hasPlayback: true, ownerName: null,
  transcodingStatus: "COMPLETED", durationSec: 120,
  createdAt: "2026-10-26T12:00:00.000Z",
};
let currentName: string | null;
let stale: boolean;
let denied: boolean;
const read = vi.fn(async () => ({
  status: denied ? 403 : 200, headers,
  body: { success: true, data: { videos: [{ ...sample, displayName: currentName }] } },
}));
const write = vi.fn(async (req: Parameters<TrainerVideoManageTransport>[0]) => {
  if (req.method === "POST") return { status: 200, headers, body: {
    success: true, data: { url: "/api/v1/training/video/video-1/manifest.m3u8?token=signed-ticket" },
  } };
  if (!stale) currentName = req.body?.displayName ?? null;
  return { status: 200, headers, body: { success: true } };
});
let host: HTMLDivElement;
let root: Root;
const session = () => ({ actor, token: "opaque", authEpoch: "epoch-1" });
async function mount(props: Partial<Parameters<typeof TrainerVideosManageRoute>[0]> = {}) {
  await act(async () => root.render(createElement(TrainerVideosManageRoute, {
    pathname: "/main-panel/my-videos", actor, token: "opaque",
    authEpoch: "epoch-1", enabled: true,
    videoReadTransport: read, videoWriteTransport: write,
    getCurrentSession: session, ...props,
  })));
}
async function selectRow() {
  const button = Array.from(host.querySelectorAll("button"))
    .find(b => b.textContent === "Начальный урок");
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function inputName(value: string) {
  const input = host.querySelector<HTMLInputElement>('form input[maxlength="255"]')!;
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
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  currentName = sample.displayName; stale = false; denied = false;
  read.mockClear(); write.mockClear();
  host = document.createElement("div");
  document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.restoreAllMocks();
});
describe("trainer video rename Vite", () => {
  it("renames selected video and only claims success after fresh GET", async () => {
    await mount();
    await selectRow();
    await inputName("Продвинутый урок");
    await submit();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "PUT", path: "/api/v1/trainer/videos/manage/video-1/name",
      body: { displayName: "Продвинутый урок" },
    });
    expect(read.mock.calls.length).toBeGreaterThan(1);
    expect(host.textContent).toContain("Название подтверждено");
  });
  it("does not claim success when same data remains on the server", async () => {
    stale = true;
    await mount(); await selectRow();
    await inputName("Другое название"); await submit();
    expect(host.textContent).not.toContain("Название подтверждено");
    expect(host.textContent).toContain("Обновление не подтверждено");
  });
  it("renders the Next-style card grid with poster, file size, date and status", async () => {
    await mount();
    expect(read.mock.calls[0]?.[0]).toBe("/api/v1/trainer/videos/catalog");
    expect(host.querySelectorAll(".trainer-video-card")).toHaveLength(1);
    expect(host.querySelector(".trainer-video-cover img")?.getAttribute("src"))
      .toBe("/api/v1/trainer/videos/poster/video-1");
    expect(host.textContent).toContain("2.0 МБ");
    expect(host.textContent).toContain("Готово");
    expect(host.textContent).toContain("Загрузка видео");
    expect(host.querySelectorAll(".trainer-videos-grid .trainer-video-card")).toHaveLength(1);
  });
  it("searches by original filename, not just display name", async () => {
    await mount();
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "original-dog-course");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelectorAll(".trainer-video-card")).toHaveLength(1);
    await act(async () => {
      setter.call(input, "not-found");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelectorAll(".trainer-video-card")).toHaveLength(0);
    expect(host.textContent).toContain("Ничего не найдено");
  });
  it("requests a signed playback ticket only after a user clicks a ready video", async () => {
    await mount();
    expect(write).not.toHaveBeenCalled();
    const play = host.querySelector<HTMLButtonElement>('button[aria-label="Смотреть видео: Начальный урок"]');
    expect(play).toBeTruthy();
    await act(async () => { play!.click(); await Promise.resolve(); });
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.[0]).toMatchObject({ method: "POST",
      path: "/api/v1/trainer/videos/playback/video-1" });
  });
  it("never exposes video metadata to unauthorized or retired staff", async () => {
    denied = true;
    await mount();
    expect(host.textContent).toContain("Доступ к видео запрещён");
    expect(host.textContent).not.toContain("Начальный урок");
    await mount({ getCurrentSession: () => null });
    expect(host.textContent).toContain("недоступны");
    expect(write).not.toHaveBeenCalled();
  });
});
