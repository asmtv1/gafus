// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerVideoSelector } from "./TrainerVideoSelector";

const actor = { id: "trainer-a", role: "TRAINER" as const };
const ticket = "https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer-a/videocourses/video-1/source.mp4";
const response = {
  status: 200, headers: { "cache-control": "private, no-store" },
  body: { success: true, data: { videos: [
    { id: "video-1", title: "Мой собачий урок", durationSec: 61,
      createdAt: "2026-11-03T10:00:00.000Z", videoUrl: ticket },
    { id: "video-2", title: "Второе занятие", durationSec: 92,
      createdAt: "2026-11-03T10:00:00.000Z",
      videoUrl: "https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer-a/videocourses/video-2/source.mp4" },
  ] } },
};
let host: HTMLDivElement, root: Root;
const read = vi.fn(async () => response);
function Page() {
  const [value, setValue] = useState("");
  return <><TrainerVideoSelector value={value} onChange={setValue}
    actor={actor} token="opaque-token" authEpoch="epoch"
    getCurrentSession={() => ({actor, token:"opaque-token", authEpoch:"epoch"})}
    videoMetadataTransport={read} /><p data-video-value={value}>{value}</p></>;
}
function MultiPage() {
  const [values, setValues] = useState<string[]>([]);
  return <><TrainerVideoSelector values={values} onChangeValues={setValues}
    actor={actor} token="opaque-token" authEpoch="epoch"
    getCurrentSession={() => ({actor,token:"opaque-token",authEpoch:"epoch"})}
    videoMetadataTransport={read} />
    <p data-attached={JSON.stringify(values)}>{values.length} attached</p></>;
}
const buttons = () => [...host.querySelectorAll<HTMLButtonElement>("button")];
async function click(text: string) {
  const button = buttons().find(button => button.textContent?.includes(text));
  if (!button) throw Error("BUTTON_MISSING: " + text);
  await act(async () => button.click());
}
async function type(selector: string, text: string) {
  const target = host.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(target,text);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  read.mockClear(); host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("trainer video selection from own library", () => {
  it("fetches the protected catalog on demand and inserts a durable URL", async () => {
    await act(async () => root.render(<Page />));
    expect(read).not.toHaveBeenCalled();
    await click("Мои видео");
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0]).toBe("/api/v1/trainer/videos/selectable");
    expect(host.querySelectorAll(".trainer-video-selector-grid li")).toHaveLength(2);
    await type('input[type="search"]', "собачий");
    expect(host.querySelectorAll(".trainer-video-selector-grid li")).toHaveLength(1);
    await click("Выбрать");
    expect(host.querySelector("[data-video-value]")?.getAttribute("data-video-value"))
      .toBe(ticket);
    expect(host.textContent).toContain("Выбрано: Мой собачий урок");
  });
  it("attaches several videos, changes their order, removes one and preserves the rest", async () => {
    await act(async () => root.render(<MultiPage />));
    await click("Мои видео");
    const tiles = () => [...host.querySelectorAll<HTMLButtonElement>(
      ".trainer-video-selector-grid button")];
    await act(async () => tiles()[0]!.click());
    await act(async () => tiles()[1]!.click());
    expect(host.querySelectorAll(".trainer-video-attached li")).toHaveLength(2);
    const attached = () => JSON.parse(host.querySelector("[data-attached]")!
      .getAttribute("data-attached")!) as string[];
    expect(attached()[0]).toBe(ticket);
    expect(attached()[1]).toContain("video-2");
    await act(async () => host.querySelector<HTMLButtonElement>(
      '[aria-label="Переместить видео 2 вверх"]')!.click());
    expect(attached()[0]).toContain("video-2");
    expect(attached()[1]).toBe(ticket);
    await act(async () => host.querySelector<HTMLButtonElement>(
      '[aria-label="Удалить видео 2"]')!.click());
    expect(attached()).toHaveLength(1);
    expect(attached()[0]).toContain("video-2");
    await click("Ссылка на видео");
    expect(attached()).toHaveLength(1);
    await click("Мои видео");
    expect(attached()).toHaveLength(1);
    expect(host.querySelectorAll(".trainer-video-attached li")).toHaveLength(1);
  });
  it("does not duplicate the same video and observes the maximum of eight", async () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({
      id: `video-${index}`, title: `Видео ${index}`, durationSec: 12,
      createdAt: "2026-11-03T10:00:00.000Z",
      videoUrl: `https://gafus-media.storage.yandexcloud.net/uploads/trainers/trainer-a/videocourses/video-${index}/original.mp4`,
    }));
    read.mockResolvedValueOnce({ ...response,
      body: { success: true, data: { videos: rows } },
    });
    await act(async () => root.render(<MultiPage />));
    await click("Мои видео");
    const tiles = () => [...host.querySelectorAll<HTMLButtonElement>(
      ".trainer-video-selector-grid button")];
    for (let index = 0; index < 8; index++)
      await act(async () => tiles()[index]!.click());
    expect(host.querySelectorAll(".trainer-video-attached li")).toHaveLength(8);
    expect(tiles()[8]!.disabled).toBe(true);
    expect(tiles()[0]!.disabled).toBe(false);
    await act(async () => tiles()[0]!.click());
    expect(host.querySelectorAll(".trainer-video-attached li")).toHaveLength(7);
    expect(tiles()[8]!.disabled).toBe(false);
  });
  it("fails closed on public caching without displaying untrusted references", async () => {
    read.mockResolvedValueOnce({ ...response,
      headers: { "cache-control": "public, max-age=3600" } });
    await act(async () => root.render(<Page />));
    await click("Мои видео");
    expect(host.querySelector("[role=alert]")?.textContent)
      .toContain("Не удалось загрузить");
    expect(host.querySelectorAll(".trainer-video-selector-grid li")).toHaveLength(0);
  });
});
