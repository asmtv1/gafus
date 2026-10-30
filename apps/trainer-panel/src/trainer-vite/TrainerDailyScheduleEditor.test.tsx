// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerOptInRoute } from "./optInRoute";
import type { TrainerDailyManageTransport } from "./TrainerDailyBundleEditor";

const actor = { id: "ADMIN_1", role: "ADMIN" as const };
const privateHeaders = { "cache-control": "private, no-store" };
const makeSchedule = (bundleId: string, published: boolean) => ({
  id: "SCHEDULE-1", date: "2026-11-05", isPublished: published,
  bundle: { id: bundleId, title: bundleId === "BUNDLE-B" ? "Связка Б" : "Связка А",
    type: "daily_course", stepsCount: 3 },
  createdBy: { id: "ADMIN_1", username: "admin" },
});
const candidates = [
  { id: "BUNDLE-A", title: "Связка А", type: "daily_course", stepsCount: 3,
    authorId: "TRAINER_A", authorUsername: "trainer" },
  { id: "BUNDLE-B", title: "Связка Б", type: "daily_course", stepsCount: 3,
    authorId: "ADMIN_1", authorUsername: "admin" },
];
let schedule: ReturnType<typeof makeSchedule> | null;
let readbackFails: boolean;
let rejectWrites: boolean;
let unreliableWrites: boolean;
const read = vi.fn(async (path: string, _signal: AbortSignal) => {
  if (path.endsWith("/candidates"))
    return { status: 200, headers: privateHeaders,
      body: { success: true, data: candidates } };
  if (path.includes("schedule-range")) {
    if (readbackFails && path.includes("from=2026-11-05&to=2026-11-05"))
      return { status: 500, headers: privateHeaders, body: { success: false } };
    return { status: 200, headers: privateHeaders,
      body: { success: true, data: schedule ? [schedule] : [] } };
  }
  throw Error("WRONG_API_PATH");
});
const write = vi.fn(async (request: Parameters<TrainerDailyManageTransport>[0]) => {
  if (rejectWrites) return { status: 409, headers: privateHeaders,
    body: { success: false, code: "SAVE_FAILED" } };
  if (request.method === "PUT") {
    const body = request.body as { bundleId: string; isPublished: boolean };
    schedule = makeSchedule(body.bundleId, body.isPublished);
  } else schedule = null;
  return { status: 200, headers: unreliableWrites ? { "cache-control": "public" } :
    privateHeaders, body: { success: true, data: { success: true, id: "SCHEDULE-1" } } };
});
let host: HTMLDivElement;
let root: Root;
type Props = Parameters<typeof TrainerOptInRoute>[0];
async function mount(override: Partial<Props> = {}) {
  const p: Props = {
    pathname: "/main-panel/daily-course", search: "?from=2026-11-05",
    actor, token: "opaque-local-only", authEpoch: "epoch-a", fetchImpl: fetch,
    enableDailyCalendar: false, enableDailyManage: true,
    dailyCalendarTransport: read, dailyManageTransport: write,
    ...override,
  };
  await act(async () => { root.render(createElement(TrainerOptInRoute, p)); });
}
function editor() {
  return host.querySelector<HTMLElement>("[data-trainer-daily-schedule-editor]");
}
async function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype :
    HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}
async function submit() {
  await act(async () => {
    editor()!.querySelector("form")!.dispatchEvent(new Event("submit", {
      bubbles: true, cancelable: true,
    }));
  });
}
const saveBtn = () => Array.from(editor()!.querySelectorAll("button"))
  .find(el => el.textContent?.includes("Сохранить назначение"))!;
const deleteBtn = () => Array.from(editor()!.querySelectorAll("button"))
  .find(el => el.textContent?.includes("Удалить будущее назначение"))!;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  schedule = makeSchedule("BUNDLE-A", true);
  readbackFails = false; rejectWrites = false; unreliableWrites = false;
  read.mockClear(); write.mockClear();
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("trainer daily-course scheduler: Core-backed safe Hono mutations", () => {
  it("only ADMIN can render editor; trainer/moderator cannot mutate", async () => {
    await mount({ actor: { id: "trainer", role: "TRAINER" } });
    expect(editor()).toBeNull();
    await mount({ actor: { id: "moderator", role: "MODERATOR" } });
    expect(editor()).toBeNull();
    await mount({ getCurrentSession: () => null });
    expect(editor()).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
  it("replacing an assigned day requires confirmation and verifies Core readback", async () => {
    await mount();
    expect(editor()).not.toBeNull();
    expect(editor()!.textContent).toContain("Связка А");
    await setValue(editor()!.querySelector("select")!, "BUNDLE-B");
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
    await submit();
    expect(write).not.toHaveBeenCalled();
    const replace = editor()!.querySelector<HTMLInputElement>(
      'input[type="checkbox"]:last-of-type');
    // Confirmation is the second checkbox in this form (the first is publication).
    expect(editor()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      .toHaveLength(2);
    await click(editor()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!);
    expect(replace).toBeTruthy();
    await submit();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({ method: "PUT",
      path: "/api/v1/trainer/daily-course/manage/schedule",
      body: { date: "2026-11-05", bundleId: "BUNDLE-B", isPublished: false },
    });
    expect(read.mock.calls.some(([path]) =>
      path.includes("schedule-range?from=2026-11-05&to=2026-11-05"))).toBe(true);
    expect(editor()!.textContent).toContain("Расписание сохранено и проверено");
  });
  it("deletes only after exact date typed and confirms absence in readback", async () => {
    await mount();
    expect((deleteBtn() as HTMLButtonElement).disabled).toBe(true);
    await click(deleteBtn());
    expect(write).not.toHaveBeenCalled();
    const target = editor()!.querySelector<HTMLInputElement>(
      'input[placeholder="ГГГГ-ММ-ДД"]')!;
    await setValue(target, "2026-11-05");
    await click(deleteBtn());
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "DELETE", path: "/api/v1/trainer/daily-course/manage/schedule/SCHEDULE-1",
    });
    expect(editor()!.textContent).toContain("Удаление расписания подтверждено");
  });
  it("non-200 and unsafe-cache write responses never show success", async () => {
    rejectWrites = true;
    await mount();
    await setValue(editor()!.querySelector("select")!, "BUNDLE-B");
    await click(editor()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!);
    await submit();
    expect(editor()!.textContent).toContain("Не удалось подтвердить изменение");
    expect(editor()!.textContent).not.toContain("Расписание сохранено и проверено");
  });
  it("missing readback does not pretend a save succeeded", async () => {
    readbackFails = true;
    await mount();
    await setValue(editor()!.querySelector("select")!, "BUNDLE-B");
    await click(editor()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!);
    await submit();
    expect(write).toHaveBeenCalledTimes(1);
    expect(editor()!.textContent).toContain("Не удалось подтвердить изменение");
    expect(editor()!.textContent).not.toContain("Расписание сохранено и проверено");
  });
  it("does not leak schedule to retired principal while a mutation is pending", async () => {
    let resolve: ((v: Awaited<ReturnType<TrainerDailyManageTransport>>) => void) | undefined;
    const delayed: TrainerDailyManageTransport = () => new Promise(done => { resolve = done; });
    await mount({ dailyManageTransport: delayed });
    await setValue(editor()!.querySelector("select")!, "BUNDLE-B");
    await click(editor()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!);
    await act(async () => {
      editor()!.querySelector("form")!.dispatchEvent(new Event("submit", {
        bubbles: true, cancelable: true,
      }));
      await Promise.resolve();
    });
    await mount({ dailyManageTransport: delayed, getCurrentSession: () => null });
    expect(editor()).toBeNull();
    await act(async () => resolve?.({ status: 200, headers: privateHeaders,
      body: { success: true, data: { id: "SCHEDULE-1" } } }));
    expect(host.textContent).not.toContain("Расписание сохранено и проверено");
  });
});
