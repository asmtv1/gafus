// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cynologists } from "./Consultations";
import { AdminHttpError } from "./api";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./api", () => ({
  requestAdmin: mocks.request,
  AdminHttpError: class AdminHttpError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  },
}));

const trainers = (first: boolean, extra = false) => [
  { userId: "trainer1", username: "trainer1", fullName: "Первый",
    avatarUrl: null, about: null, isListed: first, cynologistId: "c1" },
  { userId: "trainer2", username: "trainer2", fullName: "Второй",
    avatarUrl: null, about: null, isListed: !first, cynologistId: "c2" },
  ...(extra ? [{ userId: "trainer3", username: "trainer3", fullName: "Третий",
    avatarUrl: null, about: null, isListed: true, cynologistId: "c3" }] : []),
];

let root: Root, host: HTMLDivElement;
let saved: ReturnType<typeof vi.fn<() => void>>;
async function render(source: unknown) {
  await act(async () => root.render(<Cynologists source={source} onSaved={saved} />));
}
function checkbox(userId: string) {
  return host.querySelector<HTMLInputElement>(
    `input[aria-label="Показывать в каталоге: ${userId === "trainer1" ? "Первый" :
      userId === "trainer2" ? "Второй" : "Третий"}"]`,
  );
}
function saveButton() {
  return [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find((node) => node.textContent?.includes("Сохранить изменения каталога"));
}
async function clickSave() {
  await act(async () => saveButton()?.click());
}
async function clickToggle(userId: string) {
  const input = checkbox(userId);
  expect(input).not.toBeNull();
  await act(async () => input?.click());
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  saved = vi.fn();
  mocks.request.mockReset().mockResolvedValue({});
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Admin /consultations: server-authoritative full catalog writes", () => {
  it("rejects malformed GET without offering a destructive PUT", async () => {
    await render({ trainers: [] });
    expect(host.querySelector('[role="alert"]')?.textContent)
      .toContain("Некорректный формат");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("sends full selected set once, then takes a new GET snapshot as baseline", async () => {
    await render(trainers(true));
    expect(checkbox("trainer1")?.checked).toBe(true);
    await clickToggle("trainer2");
    await clickSave();
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/consultations/admin/cynologists/listed", {
        method: "PUT", body: { cynologistUserIds: ["trainer1", "trainer2"] },
      });
    expect(saved).toHaveBeenCalledTimes(1);
    // Subsequent authorized GET is newer than the operator's stale draft.
    await render(trainers(false, true));
    expect(checkbox("trainer1")?.checked).toBe(false);
    expect(checkbox("trainer2")?.checked).toBe(true);
    expect(checkbox("trainer3")?.checked).toBe(true);
    expect(saveButton()?.disabled).toBe(true);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it("unknown ACK blocks blind retry and requires server readback", async () => {
    mocks.request.mockRejectedValueOnce(new Error("Network timeout"));
    await render(trainers(true));
    await clickToggle("trainer2");
    await clickSave();
    expect(host.textContent).toContain("Результат сохранения неизвестен");
    expect(saveButton()?.disabled).toBe(true);
    expect(checkbox("trainer1")?.disabled).toBe(true);
    await clickSave();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    const readback = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((node) => node.textContent === "Сверить каталог с сервером");
    expect(readback).toBeDefined();
    await act(async () => readback?.click());
    expect(saved).toHaveBeenCalledTimes(1);
    await render(trainers(false));
    expect(saveButton()?.disabled).toBe(true);
    expect(host.textContent).not.toContain("Результат сохранения неизвестен");
  });
  it("explicit 409 rejection allows correction without pretending success", async () => {
    mocks.request.mockRejectedValueOnce(new AdminHttpError(409, "STALE_CONFIG", "Версия устарела"));
    await render(trainers(true));
    await clickToggle("trainer2");
    await clickSave();
    expect(host.textContent).toContain("Версия устарела");
    expect(saved).not.toHaveBeenCalled();
    expect(saveButton()?.disabled).toBe(false);
  });
});
