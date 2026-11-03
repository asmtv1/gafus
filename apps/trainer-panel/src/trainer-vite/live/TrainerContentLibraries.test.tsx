// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerStepsLibraryView } from "./TrainerStepsLibraryView";
import { TrainerDaysLibraryView } from "./TrainerDaysLibraryView";
import type { VisibleStepDto } from "../tr013VisibleStepsRead20261022";
import type { VisibleDay } from "../trainerVisibleDaysRead20261022";

const actor = { id: "trainer_1", role: "TRAINER" as const };
const current = () => true;
const steps = Array.from({ length: 62 }, (_, index): VisibleStepDto => ({
  id: `step_${index}`, title: index === 59 ? "Ёжик учит Сидеть" : `Обычный урок ${index}`,
  description: "Текст урока", type: index === 59 ? "THEORY" : "TRAINING",
  durationSec: 45, estimatedDurationSec: 50,
  videoUrl: null, imageUrls: [], pdfUrls: [], checklist: [], surveySlug: null,
  isDailyCourse: false, authorId: actor.id,
  createdAt: new Date(Date.UTC(2026, 8, 30, 12, 0, 0) - index * 86400000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 1, 12, 0, 0) - index * 86400000).toISOString(),
  author: { username: "trainer", profile: null },
  stepLinks: index === 59 ? [{ day: { id: "day_linked", title: "Поводок и прогулка",
    dayLinks: [{ course: { id: "course_a", name: "Первые команды", shortDesc: "", logoImg: "" } }],
  } }] : [],
}));
const days: VisibleDay[] = Array.from({ length: 38 }, (_, index) => ({
  id: `day_${index}`, title: index === 32 ? "Ёлка — прогулка" : `Тренировка ${index}`,
  description: "Описание тренировки", type: index === 32 ? "introduction" : "regular",
  equipment: "", authorId: actor.id, shareProgressAcrossCourses: false,
  showCoursePathExport: false,
  createdAt: new Date(Date.UTC(2026, 8, 30) - index * 86400000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 1) - index * 86400000).toISOString(),
  author: { username: "trainer", profile: null },
  stepLinks: index === 32 ? [
    { id: "link_a", order: 1, step: { id: "step_A", title: "Сидеть и ждать" } },
    { id: "link_b", order: 2, step: { id: "step_A", title: "Сидеть и ждать" } },
  ] : [],
  dayLinks: index === 32 ? [{ id: "course_link", order: 1,
    course: { id: "course_a", name: "Знакомство с собакой" } }] : [],
}));
let root: Root;
let host: HTMLDivElement;
let read: ReturnType<typeof vi.fn>;
function input(selector: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(selector);
  if (!el) throw Error("INPUT_NOT_FOUND");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw Error("NATIVE_SETTER_NOT_FOUND");
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
function select(selector: string, value: string) {
  const el = host.querySelector<HTMLSelectElement>(selector);
  if (!el) throw Error("SELECT_NOT_FOUND");
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
async function click(selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector);
  if (!button) throw Error("BUTTON_NOT_FOUND:" + selector);
  await act(async () => button.click());
}
function titles() {
  return [...host.querySelectorAll(
    ".trainer-catalog-item-content > summary, .trainer-catalog-day-title",
  )].map(el => el.textContent);
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  read = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
function StepHarness() {
  const [query, setQuery] = React.useState("");
  return <TrainerStepsLibraryView rows={steps} actor={actor} query={query} onQuery={setQuery}
    isDaily={false} dailyPath={false} onDaily={() => {}}
    canEdit={true} transport={read} current={current} onRefresh={() => {}}
    write={async () => { throw Error("TEST_ONLY_NO_WRITE"); }} />;
}
function DayHarness() {
  const [query, setQuery] = React.useState("");
  const [selected, onSelect] = React.useState<string | null>(null);
  return <TrainerDaysLibraryView rows={days} actor={actor} search={query} onSearch={setQuery}
    selected={selected} onSelect={onSelect} transport={read} isCurrent={current}
    onRefresh={() => {}} showEditorLinks={true} />;
}
describe("steps content management and complete-dataset search", () => {
  it("finds an item at index 59 with normalized multiword search before pagination", async () => {
    await act(async () => root.render(<StepHarness />));
    expect(host.querySelectorAll("ul.trainer-catalog-list > li")).toHaveLength(10);
    await act(async () => input('input[aria-label="Поиск шага по названию"]', "ежик сидеть"));
    expect(titles()).toEqual(["Ёжик учит Сидеть — trainer"]);
    expect(host.textContent).toContain("Найдено: 1");
    expect(host.textContent).toContain("Загружено шагов: 62; показано: 1");
    expect(read).not.toHaveBeenCalled();
  });
  it("finds related day/course and filters orphan status, without an additional GET", async () => {
    await act(async () => root.render(<StepHarness />));
    await act(async () => input('input[aria-label="Поиск шага по названию"]', "первые команды"));
    expect(titles()).toEqual(["Ёжик учит Сидеть — trainer"]);
    await act(async () => input('input[aria-label="Поиск шага по названию"]', "поводок"));
    expect(titles()).toEqual(["Ёжик учит Сидеть — trainer"]);
    await act(async () => select('select[aria-label="Связи шага"]', "ORPHAN"));
    expect(titles()).toHaveLength(0);
    await click(".trainer-catalog-reset");
    expect(titles()).toHaveLength(10);
    expect(read).not.toHaveBeenCalled();
  });
  it("paginates all 62 rows, preserves selection when changing pages, and links a new day", async () => {
    await act(async () => root.render(<StepHarness />));
    await click('.trainer-catalog-checkall input[type="checkbox"]');
    expect(host.textContent).toContain("Выбрано: 10");
    await click('.trainer-catalog-pager button:last-child');
    expect(titles()).toHaveLength(10);
    expect(host.textContent).toContain("Страница 2 из 7");
    const link = host.querySelector<HTMLAnchorElement>('.trainer-catalog-derived');
    expect(link?.getAttribute("href")?.split("stepIds=").length).toBe(11);
    expect(read).not.toHaveBeenCalled();
  });
});
describe("days content management and linked-step search", () => {
  it("finds day at index 32 by its own name and by linked step/course names", async () => {
    await act(async () => root.render(<DayHarness />));
    expect(titles()).toHaveLength(10);
    await act(async () => input('input[aria-label="Поиск дня по названию"]', "елка прогулка"));
    expect(titles()).toEqual(["Ёлка — прогулка"]);
    await act(async () => input('input[aria-label="Поиск дня по названию"]', "сидеть ждать"));
    expect(titles()).toEqual(["Ёлка — прогулка"]);
    await act(async () => input('input[aria-label="Поиск дня по названию"]', "знакомство собакой"));
    expect(titles()).toEqual(["Ёлка — прогулка"]);
    expect(read).not.toHaveBeenCalled();
  });
  it("restores saved step repetition when opening a searched day", async () => {
    await act(async () => root.render(<DayHarness />));
    await act(async () => input('input[aria-label="Поиск дня по названию"]', "знакомство"));
    await click('.trainer-catalog-day-title');
    const detail = host.querySelector('[aria-label="Подробности выбранного дня"]');
    expect(detail?.querySelectorAll("ol:first-of-type > li")).toHaveLength(2);
    expect(detail?.textContent).toContain("Знакомство с собакой");
  });
});
describe("protected destructive list actions use confirmation and verified readback", () => {
  it("never confirms step deletion after an ACK if the fresh GET still contains the step", async () => {
    const write = vi.fn(async () => ({ status: 200,
      headers: { "cache-control": "private, no-store" }, body: { success: true } }));
    read.mockImplementation(async () => ({ status: 200,
      headers: { "cache-control": "private, no-store" },
      body: { success: true, data: steps } }));
    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(true);
    const refresh = vi.fn();
    await act(async () => root.render(<TrainerStepsLibraryView
      rows={steps} actor={actor} query="" onQuery={() => {}} isDaily={false}
      dailyPath={false} onDaily={() => {}} canEdit={true} transport={read}
      write={write} onRefresh={refresh} current={current} />));
    await click('.trainer-catalog-item-actions button');
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      method: "DELETE", path: "/api/v1/trainer/steps/manage/step_0",
    }));
    expect(host.textContent).toContain("Удаление не подтверждено");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("confirms day removal only once authorized readback excludes it", async () => {
    const write = vi.fn(async () => ({ status: 200,
      headers: { "cache-control": "private, no-store" }, body: { success: true } }));
    read.mockImplementation(async () => ({ status: 200,
      headers: { "cache-control": "private, no-store" },
      body: { success: true, data: days.filter(row => row.id !== "day_0") } }));
    const refresh = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => root.render(<TrainerDaysLibraryView rows={days}
      actor={actor} search="" onSearch={() => {}} selected={null} onSelect={() => {}}
      showEditorLinks={true} transport={read} write={write}
      onRefresh={refresh} isCurrent={current} />));
    await click('.trainer-catalog-item-actions button');
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      method: "DELETE", path: "/api/v1/trainer/days/manage/day_0",
    }));
    expect(host.textContent).toContain("Удаление подтверждено сервером");
    expect(refresh).toHaveBeenCalledOnce();
  });
});
