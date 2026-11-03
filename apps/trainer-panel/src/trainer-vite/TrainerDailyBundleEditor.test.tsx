// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerOptInRoute } from "./optInRoute";
import type { TrainerDailyManageTransport } from "./TrainerDailyBundleEditor";
import type { DailyBundle } from "./tr014DailyBundlesRead20261022";

const actor = { id: "trainer-A", role: "TRAINER" as const };
const cc = { "cache-control": "private, no-store" };
const candidates = [
  { id: "step-1", title: "Первый", type: "TRAINING", durationSec: 60,
    authorId: actor.id, authorUsername: "trainer" },
  { id: "step-2", title: "Второй", type: "TRAINING", durationSec: 90,
    authorId: actor.id, authorUsername: "trainer" },
];
let savedBundles: DailyBundle[] = [];
let readbackStale = false;
const fetchRead = vi.fn(async (path: string, _signal: AbortSignal) => ({
  status: 200, headers: cc, body: { success: true, data: path.includes("bundle-step-candidates") ?
    candidates : readbackStale ? [] : savedBundles },
}));
const save = vi.fn(async (request: Parameters<TrainerDailyManageTransport>[0]): Promise<{
  status: number; headers: Record<string, string>; body: unknown;
}> => {
  const data = request.body as {
    id?: string; title: string; type: string; equipment: string;
    description: string; stepIds: string[];
  };
  if (request.method === "PUT") savedBundles = [{
    id: data.id ?? "bundle-1", title: data.title, type: data.type,
    stepsCount: data.stepIds.length, equipment: data.equipment,
    description: data.description, authorId: actor.id, authorUsername: "trainer",
    steps: data.stepIds.map((id, index) => ({
      id, title: candidates.find(candidate => candidate.id === id)?.title ?? "Шаг",
      type: "TRAINING", order: index + 1,
    })),
  }];
  return { status: 200, headers: cc,
    body: { success: true, data: { success: true, id: data.id ?? "bundle-1" } } };
});
let host: HTMLDivElement;
let root: Root;
type P = Parameters<typeof TrainerOptInRoute>[0];
const mount = async (more: Partial<P> = {}) => {
  const props: P = {
    pathname: "/main-panel/daily-course/bundles", actor,
    token: "scoped-session", authEpoch: "a", fetchImpl: fetch,
    enableDailyBundles: false, enableDailyManage: true,
    dailyBundleTransport: fetchRead,
    dailyManageTransport: save as TrainerDailyManageTransport, ...more,
  };
  await act(async () => root.render(createElement(TrainerOptInRoute, props)));
};
async function change(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetchRead.mockClear(); save.mockClear();
  savedBundles = []; readbackStale = false;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("trainer bundle editor Hono PUT opt-in", () => {
  it("opens the selected library bundle directly in the editor without writing", async () => {
    const row = {
      id: "bundle-for-edit", title: "Связка из библиотеки", type: "daily_course",
      stepsCount: 2, authorId: actor.id, authorUsername: "trainer", equipment: "Поводок",
      description: "Для спокойной прогулки",
      steps: [
        { id: "step-1", title: "Первый", type: "TRAINING", order: 1 },
        { id: "step-2", title: "Второй", type: "TRAINING", order: 2 },
      ],
    };
    const fetchLibrary = vi.fn(async (path: string) => ({ status: 200, headers: cc,
      body: { success: true, data: path.includes("bundle-step-candidates") ? candidates : [row] },
    }));
    await mount({ enableDailyBundles: true, dailyBundleTransport: fetchLibrary });
    const reader = host.querySelector<HTMLElement>('main[data-tr014="read-only"]');
    expect(reader?.textContent).toContain(row.title);
    const selectInLibrary = [...reader!.querySelectorAll("button")]
      .find(button => button.textContent === row.title);
    expect(selectInLibrary).toBeTruthy();
    await act(async () => selectInLibrary!.click());
    const editLink = reader!.querySelector<HTMLAnchorElement>(
      'a[href="#daily-bundle-editor"]');
    expect(editLink?.textContent).toContain("Редактировать связку");
    await act(async () => editLink!.click());
    const editor = host.querySelector<HTMLElement>("[data-daily-bundle-editor]");
    expect(editor?.querySelector<HTMLSelectElement>(
      'select[aria-label="Редактируемая связка"]')?.value).toBe(row.id);
    expect(editor?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(row.title);
    expect(save).not.toHaveBeenCalled();
  });
  it("reads bounded same-owner candidates; saves ordered step IDs once", async () => {
    await mount();
    expect(fetchRead).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Создать или изменить связку");
    const name = host.querySelector("section[data-daily-bundle-editor] input[required]")! as HTMLInputElement;
    await change(name, "Две команды");
    const checks = host.querySelectorAll<HTMLInputElement>(
      "section[data-daily-bundle-editor] input[type=\"checkbox\"]");
    expect(checks).toHaveLength(2);
    await act(async () => checks.forEach(check => check.click()));
    await act(async () => host.querySelector<HTMLFormElement>(
      "section[data-daily-bundle-editor] form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0]).toMatchObject({
      method: "PUT", path: "/api/v1/trainer/daily-course/manage/bundles",
      body: { title: "Две команды", stepIds: ["step-1", "step-2"] },
    });
    expect(host.textContent).toContain("Связка сохранена");
    expect((host.querySelector("select[aria-label=\"Редактируемая связка\"]") as
      HTMLSelectElement).value).toBe("bundle-1");
    // A second save targets the existing ID rather than creating a duplicate.
    await act(async () => host.querySelector<HTMLFormElement>(
      "section[data-daily-bundle-editor] form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0]).toMatchObject({
      method: "PUT", body: { id: "bundle-1", title: "Две команды" },
    });
  });
  it("cannot show write editor to moderator, guest or retired user", async () => {
    await mount({ actor: { id: "mod", role: "MODERATOR" } });
    expect(host.querySelector("[data-daily-bundle-editor]")).toBeNull();
    await mount({ getCurrentSession: () => null });
    expect(host.querySelector("[data-daily-bundle-editor]")).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it("deletes selected unused bundle only after typing its exact title and checking GET", async () => {
    const row = {
      id: "bundle-available", title: "Связка для удаления", type: "daily_course",
      stepsCount: 2, authorId: actor.id, authorUsername: "trainer", equipment: "",
      description: "Пробная связка",
      steps: [{ id: "step-1", title: "Первый", type: "TRAINING", order: 1 },
        { id: "step-2", title: "Второй", type: "TRAINING", order: 2 }],
    };
    let rows = [row];
    const ownRead = vi.fn(async (path: string) => ({ status: 200, headers: cc,
      body: { success: true, data: path.includes("bundle-step-candidates") ? candidates : rows },
    }));
    const ownWrite = vi.fn(async (request: Parameters<TrainerDailyManageTransport>[0]) => {
      if (request.method === "DELETE") rows = [];
      return { status: 200, headers: cc, body: { success: true } };
    });
    await mount({ dailyBundleTransport: ownRead, dailyManageTransport: ownWrite });
    const select = host.querySelector<HTMLSelectElement>(
      "section[data-daily-bundle-editor] select")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select, "bundle-available");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const del = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent === "Удалить выбранную связку")!;
    expect(del.disabled).toBe(true);
    await act(async () => del.click());
    expect(ownWrite).not.toHaveBeenCalled();
    const input = host.querySelector<HTMLInputElement>(
      "section[data-daily-bundle-editor] fieldset:last-of-type input")!;
    await change(input, "Связка для удаления");
    await act(async () => del.click());
    expect(ownWrite).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      method: "DELETE", path: "/api/v1/trainer/daily-course/manage/bundles/bundle-available",
    }));
    expect(host.textContent).toContain("Удаление связки подтверждено");
    expect(ownRead).toHaveBeenCalledTimes(3);
  });
  it("in-use bundle conflict never claims deletion", async () => {
    const row = {
      id: "bundle-in-use", title: "Связка курса", type: "daily_course",
      stepsCount: 2, authorId: actor.id, authorUsername: "trainer", equipment: "",
      description: "Связка используется в курсе",
      steps: [{ id: "step-1", title: "Первый", type: "TRAINING", order: 1 },
        { id: "step-2", title: "Второй", type: "TRAINING", order: 2 }],
    };
    const ownRead = vi.fn(async (path: string) => ({ status: 200, headers: cc,
      body: { success: true, data: path.includes("bundle-step-candidates") ?
        candidates : [row] },
    }));
    const reject = vi.fn(async () => ({ status: 409, headers: cc,
      body: { success: false, code: "SAVE_FAILED" },
    }));
    await mount({ dailyBundleTransport: ownRead, dailyManageTransport: reject });
    const select = host.querySelector<HTMLSelectElement>(
      "section[data-daily-bundle-editor] select")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select, "bundle-in-use");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await change(host.querySelector<HTMLInputElement>(
      "section[data-daily-bundle-editor] fieldset:last-of-type input")!, "Связка курса");
    const del = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent === "Удалить выбранную связку")!;
    await act(async () => del.click());
    expect(reject).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Удаление не подтверждено");
    expect(host.textContent).not.toContain("Удаление связки подтверждено");
  });
  it("does not claim save success when owner GET cannot confirm linked steps", async () => {
    await mount();
    await change(host.querySelector("section[data-daily-bundle-editor] input[required]")!,
      "Сохранение без readback");
    await act(async () => host.querySelectorAll<HTMLInputElement>(
      "section[data-daily-bundle-editor] input[type=\"checkbox\"]").forEach(x => x.click()));
    readbackStale = true;
    await act(async () => host.querySelector<HTMLFormElement>(
      "section[data-daily-bundle-editor] form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Сохранение не подтверждено");
    expect(host.textContent).not.toContain("Связка сохранена и проверена");
    expect((host.querySelector("select[aria-label=\"Редактируемая связка\"]") as
      HTMLSelectElement).value).toBe("bundle-1");
  });
  it("error response never claims bundle saved", async () => {
    save.mockResolvedValueOnce({ status: 409, headers: cc,
      body: { success: false, code: "SAVE_FAILED" } });
    await mount();
    await change(host.querySelector("section[data-daily-bundle-editor] input[required]")!, "Две команды");
    await act(async () => host.querySelectorAll<HTMLInputElement>(
      "section[data-daily-bundle-editor] input[type=\"checkbox\"]").forEach(x => x.click()));
    await act(async () => host.querySelector<HTMLFormElement>(
      "section[data-daily-bundle-editor] form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Не удалось сохранить связку");
    expect(host.textContent).not.toContain("Связка сохранена");
  });
});
