// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ initiate: vi.fn(), report: vi.fn() }));
vi.mock("@shared/server-actions", () => ({ initiateVkIdAuth: mocks.initiate }));
vi.mock("@gafus/error-handling", () => ({ reportClientError: mocks.report }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { VkIdOneTap } from "./VkIdOneTap";
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); });
it("does not start two OAuth sessions on rapid clicks and unlocks after an error", async () => {
  let resolve!: (result: unknown) => void;
  mocks.initiate.mockImplementation(() => new Promise(done => { resolve = done; }));
  await act(async () => root.render(<VkIdOneTap />));
  await act(async () => {
    container.querySelector("button")!.click();
    container.querySelector("button")!.click();
  });
  expect(mocks.initiate).toHaveBeenCalledTimes(1);
  expect(container.querySelector("button")!.disabled).toBe(true);
  await act(async () => resolve({ success: false, error: "Повторите попытку" }));
  expect(container.querySelector('[role="alert"]')!.textContent).toBe("Повторите попытку");
  expect(container.querySelector("button")!.disabled).toBe(false);
});
it("reports rejected requests and permits a retry", async () => {
  mocks.initiate.mockRejectedValue(new Error("offline"));
  await act(async () => root.render(<VkIdOneTap />));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')!.textContent).toContain("Ошибка соединения");
  await act(async () => container.querySelector("button")!.click());
  expect(mocks.initiate).toHaveBeenCalledTimes(2);
  expect(container.querySelector("button")!.disabled).toBe(false);
});

it("ignores a late response after leaving the page", async () => {
  let reject!: (error: Error) => void;
  mocks.initiate.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  await act(async () => root.render(<VkIdOneTap />));
  await act(async () => container.querySelector("button")!.click());
  await act(async () => root.render(null));
  await act(async () => reject(new Error("late failure")));
  expect(mocks.report).not.toHaveBeenCalled();
  expect(container.textContent).toBe("");
});
