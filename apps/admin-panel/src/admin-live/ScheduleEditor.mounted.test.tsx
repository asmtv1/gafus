// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./api", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  requestAdmin: mock.request,
}));

import { AdminHttpError } from "./api";
import { ScheduleEditor } from "./ScheduleEditor";

const fixture = {
  availability: { rules: [], slotDurationMin: 30, dayOffs: [], exceptions: [] },
  editableSlots: [],
};
let root: Root;
let host: HTMLDivElement;
const onSaved = vi.fn();

beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());

function button(label: string): HTMLButtonElement {
  const el = [...host.querySelectorAll("button")].find((node) => node.textContent?.includes(label));
  if (!el) throw Error(`Button not found: ${label}`);
  return el;
}

beforeEach(async () => {
  mock.request.mockReset();
  onSaved.mockClear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<ScheduleEditor source={fixture} trainerId="trainer1" onSaved={onSaved} />);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("mounted admin schedule staff mutations", () => {
  it("shows exactly seven original Next weekdays, not duplicate add/remove actions", () => {
    expect(host.querySelectorAll(".schedule-editor tbody tr").length).toBe(7);
    expect(host.textContent).not.toContain("Добавить интервал");
  });

  it("lost PUT acknowledgement blocks retry until explicit readback", async () => {
    mock.request.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => {
      button("Сохранить расписание").click();
    });
    expect(mock.request).toHaveBeenCalledTimes(1);
    expect(button("Сохранить расписание").disabled).toBe(true);
    expect(button("Сверить расписание с сервером").disabled).toBe(false);
    await act(async () => {
      button("Сверить расписание с сервером").click();
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(mock.request).toHaveBeenCalledTimes(1);
  });

  it("an explicit HTTP 400 does not lock the form", async () => {
    mock.request.mockRejectedValueOnce(new AdminHttpError(400, "INVALID_AVAILABILITY", "Invalid"));
    await act(async () => {
      button("Сохранить расписание").click();
    });
    expect(button("Сохранить расписание").disabled).toBe(false);
    expect(host.textContent).not.toContain("Сверить расписание с сервером");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Invalid");
  });
});
