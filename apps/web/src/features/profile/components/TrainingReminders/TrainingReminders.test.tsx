// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@shared/lib/actions/trainingReminders", () => ({
  getTrainingReminders: mocks.load,
  createTrainingReminder: mocks.create,
  updateTrainingReminder: mocks.update,
  deleteTrainingReminder: vi.fn(),
}));
vi.mock("@gafus/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@gafus/error-handling", () => ({ reportClientError: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/reminders" }));
import TrainingReminders from "./TrainingReminders";
let root: Root;
let host: HTMLDivElement;
const reminder = {
  id: "synthetic",
  name: "Тренировка",
  enabled: true,
  reminderTime: "09:00",
  reminderDays: "1",
  timezone: "Europe/Moscow",
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ success: true, data: [reminder] });
  host = document.createElement("div");
  root = createRoot(host);
  document.body.append(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it("does not create two reminders on immediate repeated clicks", async () => {
  mocks.create.mockReturnValue(new Promise(() => {}));
  await act(async () => root.render(<TrainingReminders />));
  const add = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Добавить напоминание"),
  )!;
  await act(async () => {
    add.click();
    add.click();
  });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(add.disabled).toBe(true);
});
it("clears the stored day selection with null when the last day is unchecked", async () => {
  mocks.update.mockImplementation(async (_id, data) => ({
    success: true,
    data: { ...reminder, ...data },
  }));
  await act(async () => root.render(<TrainingReminders />));
  await act(async () =>
    (host.querySelector('button[aria-label="Развернуть"]') as HTMLButtonElement).click(),
  );
  const monday = [...host.querySelectorAll('input[type="checkbox"]')].find(
    (input) => input.parentElement?.textContent?.trim() === "Пн",
  ) as HTMLInputElement;
  await act(async () => monday.click());
  expect(mocks.update).toHaveBeenCalledWith(
    "synthetic",
    expect.objectContaining({ reminderDays: null }),
  );
});
