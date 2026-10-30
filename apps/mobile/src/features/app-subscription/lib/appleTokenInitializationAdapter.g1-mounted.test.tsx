// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppleTokenInitializationAdapter } from "./appleTokenInitializationAdapter";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const UUID = "b713906f-c774-41d9-84ae-1585fb13f232";
const E1 = "51e35071-0752-4f22-b3aa-23f8844c8931";
const E2 = "67b6036b-c6c2-43d7-8e78-fd3b3d806ba2";
const m = vi.hoisted(() => ({
  read: vi.fn(),
  init: vi.fn(),
  purchase: vi.fn(),
  epoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
}));
const s = (token: string | null) => ({
  success: true as const,
  data: { appleAppAccountToken: token },
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function ReviewScreen() {
  const [status, setStatus] = useState("ready");
  const [adapter] = useState(() =>
    createAppleTokenInitializationAdapter({
      currentActor: () => ({ ownerId: "A", authEpoch: m.epoch }),
      fetchSnapshot: () => m.read(),
      initializeToken: () => m.init(),
      purchase: (payload) => m.purchase(payload),
    }),
  );
  return createElement(
    "div",
    null,
    createElement(
      "button",
      {
        onClick: () => {
          void adapter.begin("apple-monthly").then((r) => setStatus(r.ok ? "finished" : r.reason));
        },
      },
      "Оформить",
    ),
    createElement("span", { "data-state": true }, status),
  );
}
let host: HTMLDivElement;
let root: Root;
async function flush() {
  await act(async () => {
    for (let i = 0; i < 9; i++) await Promise.resolve();
  });
}
async function click() {
  await act(async () => host.querySelector("button")?.click());
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  m.epoch = E1;
  m.read.mockResolvedValue(s(UUID));
  m.init.mockResolvedValue({ success: true, data: { appleAppAccountToken: UUID } });
  m.purchase.mockResolvedValue({ ok: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("mounted injected Apple Phase-A review harness, not real paywall/provider", () => {
  it("rapid taps during deferred explicit init issue one init and one purchase", async () => {
    m.read.mockReset().mockResolvedValueOnce(s(null)).mockResolvedValueOnce(s(UUID));
    const wait = deferred<{ success: true; data: { appleAppAccountToken: string } }>();
    m.init.mockReturnValueOnce(wait.promise);
    await act(async () => root.render(createElement(ReviewScreen)));
    await click();
    await click();
    expect(m.init).toHaveBeenCalledTimes(1);
    expect(m.purchase).not.toHaveBeenCalled();
    await act(async () => wait.resolve({ success: true, data: { appleAppAccountToken: UUID } }));
    await flush();
    expect(m.purchase).toHaveBeenCalledTimes(1);
  });
  it("new authEpoch during init suppresses StoreKit despite returned UUID", async () => {
    m.read.mockResolvedValueOnce(s(null));
    const wait = deferred<{ success: true; data: { appleAppAccountToken: string } }>();
    m.init.mockReturnValueOnce(wait.promise);
    await act(async () => root.render(createElement(ReviewScreen)));
    await click();
    m.epoch = E2;
    await act(async () => wait.resolve({ success: true, data: { appleAppAccountToken: UUID } }));
    await flush();
    expect(host.querySelector("[data-state]")?.textContent).toBe("SESSION_CHANGED");
    expect(m.purchase).not.toHaveBeenCalled();
  });
});
