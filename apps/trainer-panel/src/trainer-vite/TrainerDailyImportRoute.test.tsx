// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerDailyImportRoute, type DailyImportTransport } from "./TrainerDailyImportRoute";
const actor = { id: "trainer-a", role: "TRAINER" as const };
const header = { "cache-control": "private, no-store" };
const day = { date: "2099-01-02", bundleTitle: "Первые команды",
  description: "Делаем упражнения", isEmpty: false, isPast: false,
  canImport: true, canReplaceConflict: false, conflict: null, errors: [],
  steps: [
    { order: 1, title: "Сидеть", type: "THEORY", errors: [] },
    { order: 2, title: "Место", type: "TRAINING", errors: [] },
  ],
};
const conflict = { ...day, date: "2099-01-03", canImport: false,
  conflict: { scheduleId: "schedule-old", bundleTitle: "Старый день", isPublished: true },
};
const preview = { days: [day, conflict], hasErrors: false,
  summary: { totalDays: 2, emptyDays: 0, importableDays: 1, conflictDays: 1, errorDays: 0 },
};
const transport = vi.fn<DailyImportTransport>(async input => ({
  status: 200, headers: header,
  body: input.path.endsWith("/preview") ? { success: true,
    data: { preview, previewDigest: "a".repeat(64) } } :
    { success: true, data: { importedDates: ["2099-01-02"],
      skippedDates: [{date:"2099-01-03",reason:"CONFLICT"}] } },
}));
let root: Root, host: HTMLDivElement;
async function mount(role: "TRAINER" | "USER" = "TRAINER") {
  const identity = { ...actor, role };
  await act(async () => root.render(<TrainerDailyImportRoute
    pathname="/main-panel/daily-course/import" actor={identity}
    token="opaque-token" authEpoch="epoch" enabled
    getCurrentSession={() => ({actor:identity, token:"opaque-token", authEpoch:"epoch"})}
    dailyImportTransport={transport} />));
}
async function input(selector: string, value: string) {
  const el = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
    HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(label: string) {
  const el = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent?.includes(label));
  if (!el) throw Error("BUTTON_NOT_FOUND: " + label);
  await act(async () => el.click());
}
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT:true});
  transport.mockClear(); host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("daily course import from .md and .txt", () => {
  it("shows steps, errors, conflicts and only adds after typed confirmation", async () => {
    await mount();
    await input("textarea", "## 2099-01-02\nBundle title: Первые команды");
    await click("Показать предпросмотр");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Первые команды");
    expect(host.textContent).toContain("Старый день");
    expect(host.textContent).toContain("Существующие назначения");
    expect(host.querySelectorAll(".trainer-workspace-table-scroll tbody tr")).toHaveLength(2);
    expect(transport.mock.calls[0]![0].path).toContain("/preview");
    expect(host.querySelector<HTMLButtonElement>(".trainer-import-confirm button")!.disabled).toBe(true);
    await input('.trainer-import-confirm input', "ИМПОРТИРОВАТЬ");
    await click("Импортировать 1 дат");
    expect(transport.mock.calls[1]![0]).toMatchObject({ method: "POST",
      path: "/api/v1/trainer/daily-course/import/confirm",
      body: { confirmation: "ИМПОРТИРОВАТЬ", previewDigest: "a".repeat(64) },
    });
    expect(host.textContent).toContain("Добавлено дат: 1");
    expect(host.textContent).toContain("Пропущено: 1");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("invalidates stale preview on editing and never imports without a review", async () => {
    await mount();
    await input("textarea", "original"); await click("Показать предпросмотр");
    await input("textarea", "changed");
    expect(host.querySelector(".trainer-import-confirm")).toBeNull();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("does not show import form to nonstaff or send any request", async () => {
    await mount("USER");
    expect(host.textContent).toContain("Импорт курса дня недоступен");
    expect(host.querySelector("input[type=file]")).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });
});
