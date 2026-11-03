// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TrainerCourseDayPicker, applyTrainerDayDrop } from "./TrainerCourseDayPicker";

const days = [
  { id: "day-1", title: "Команда «Сидеть»" },
  { id: "day-2", title: "Команда «Лежать»" },
  { id: "day-3", title: "Работа с отвлечениями" },
];
let container: HTMLDivElement;
let root: Root;
let changes: ReturnType<typeof vi.fn<(ids: string[]) => void>>;
async function render(initial: string[] = []) {
  function Harness() {
    const [value, setValue] = useState(initial);
    return <>
      <TrainerCourseDayPicker available={days} selectedIds={value} onChange={ids => {
        changes(ids); setValue(ids);
      }} />
      <output data-testid="day-ids">{JSON.stringify(value)}</output>
    </>;
  }
  await act(async () => root.render(<Harness />));
}
function order() {
  return JSON.parse(container.querySelector('[data-testid="day-ids"]')!.textContent!) as string[];
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")]
    .find(node => node.getAttribute("aria-label") === label || node.textContent?.trim() === label);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  changes = vi.fn<(ids: string[]) => void>();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
describe("Next dual-list trainer day picker", () => {
  it("adds the same day repeatedly, preserving each occurrence independently", async () => {
    await render();
    await click("Добавить день: Команда «Сидеть»");
    await click("Добавить день: Команда «Сидеть»");
    await click("Добавить день: Команда «Лежать»");
    expect(order()).toEqual(["day-1", "day-1", "day-2"]);
    expect(container.querySelectorAll(".trainer-day-selected-row")).toHaveLength(3);
    await click("Убрать день: Команда «Сидеть», позиция 2");
    expect(order()).toEqual(["day-1", "day-2"]);
    expect(container.querySelectorAll(".trainer-day-selected-row")).toHaveLength(2);
  });
  it("moves a particular duplicate up and down with accessible fallback controls", async () => {
    await render(["day-1", "day-2", "day-1"]);
    await click("Переместить ниже: Команда «Сидеть», позиция 1");
    expect(order()).toEqual(["day-2", "day-1", "day-1"]);
    await click("Переместить выше: Команда «Сидеть», позиция 3");
    expect(order()).toEqual(["day-2", "day-1", "day-1"]);
    await click("Убрать день: Команда «Сидеть», позиция 2");
    expect(order()).toEqual(["day-2", "day-1"]);
    expect(changes).toHaveBeenCalledTimes(3);
  });
  it("adds all days without clearing the available column; remove all clears only course order", async () => {
    await render(["day-1"]);
    await click("Добавить все");
    expect(order()).toEqual(["day-1", "day-1", "day-2", "day-3"]);
    expect(container.querySelectorAll(".trainer-day-available-row")).toHaveLength(3);
    await click("Убрать все");
    expect(order()).toEqual([]);
    expect(container.querySelectorAll(".trainer-day-available-row")).toHaveLength(3);
  });
  it("keeps one actual selected row per day occurrence, never keying by dayId", async () => {
    await render(["day-1", "day-1", "day-1"]);
    const rows = container.querySelectorAll<HTMLElement>(".trainer-day-selected-row");
    expect([...rows].map(row => row.dataset.dayId)).toEqual(["day-1", "day-1", "day-1"]);
    expect([...rows].map(row => row.dataset.occurrence)).toEqual(["0", "1", "2"]);
    expect(container.querySelector('[data-drop-zone="selected"]')).toBeTruthy();
  });
});
describe("shared picker in training-step mode", () => {
  it("renders step-specific labels and allows repeated selected step occurrences", async () => {
    function StepHarness() {
      const [ids, setIds] = useState<string[]>([]);
      return <TrainerCourseDayPicker kind="step" available={days}
        selectedIds={ids} onChange={setIds} />;
    }
    await act(async () => root.render(<StepHarness />));
    expect(container.textContent).toContain("Поиск шагов");
    await click("Добавить шаг: Команда «Сидеть»");
    await click("Добавить шаг: Команда «Сидеть»");
    expect([...container.querySelectorAll<HTMLElement>(".trainer-day-selected-row")]
      .map(row => row.dataset.stepId)).toEqual(["day-1", "day-1"]);
    await click("Убрать шаг: Команда «Сидеть», позиция 1");
    expect(container.querySelectorAll(".trainer-day-selected-row")).toHaveLength(1);
    expect(container.querySelector('ol[aria-label="Порядок выбранных шагов"]')).toBeTruthy();
  });
});
describe("drag source and drop target ordering semantics", () => {
  it("inserts a repeated day at a target position, not only at the end", () => {
    expect(applyTrainerDayDrop(["a", "b", "a"], "available:a", "selected:1"))
      .toEqual(["a", "a", "b", "a"]);
    expect(applyTrainerDayDrop(["a", "b"], "available:b", "selected-list"))
      .toEqual(["a", "b", "b"]);
    expect(applyTrainerDayDrop([], "available:a", "selected-list"))
      .toEqual(["a"]);
  });
  it("moves specific repeated occurrences, including to the last position", () => {
    expect(applyTrainerDayDrop(["a", "b", "a"], "selected:0", "selected:2"))
      .toEqual(["b", "a", "a"]);
    expect(applyTrainerDayDrop(["b", "a", "a"], "selected:1", "selected-list"))
      .toEqual(["b", "a", "a"]);
    expect(applyTrainerDayDrop(["a", "b", "a"], "selected:1", "available-list"))
      .toEqual(["a", "a"]);
  });
  it("no-ops on invalid drop targets or capacity overflow", () => {
    expect(applyTrainerDayDrop(["a", "b"], "available:x", null)).toEqual(["a", "b"]);
    expect(applyTrainerDayDrop(["a"], "selected:100", "selected:0")).toEqual(["a"]);
    expect(applyTrainerDayDrop(Array(250).fill("a"), "available:a", "selected-list"))
      .toHaveLength(250);
  });
});
