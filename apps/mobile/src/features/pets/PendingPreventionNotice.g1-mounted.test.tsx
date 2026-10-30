// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("react-native-paper", () => ({ Text: "span" }));
import { PendingPreventionNotice } from "./PendingPreventionNotice";
import type { PendingPreventionPreview } from "@/shared/lib/offline/newOnlyV2PreventionPending";
const entry: PendingPreventionPreview = {
  eventId: "e1",
  type: "VACCINATION",
  performedAt: "2026-10-17T00:00:00.000Z",
};
function mount(entries: PendingPreventionPreview[]) {
  const div = document.createElement("div");
  const root = createRoot(div);
  return { div, root, entries };
}
describe("AG3 pending prevention mounted local-only view", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  it("renders offline-only status + step information and never claims server sync", async () => {
    const ctx = mount([entry]);
    await act(async () =>
      ctx.root.render(createElement(PendingPreventionNotice, { entries: ctx.entries })),
    );
    expect(ctx.div.textContent).toContain("Сохранено только на этом устройстве · не отправлено");
    expect(ctx.div.textContent).toContain("Прививка");
    expect(ctx.div.textContent).not.toContain("Синхронизировано");
    await act(async () => ctx.root.unmount());
  });
  it("clears mounted data immediately on account switch / failed owner-epoch read", async () => {
    const ctx = mount([entry]);
    await act(async () =>
      ctx.root.render(createElement(PendingPreventionNotice, { entries: ctx.entries })),
    );
    await act(async () => ctx.root.render(createElement(PendingPreventionNotice, { entries: [] })));
    expect(ctx.div.textContent).toBe("");
    await act(async () => ctx.root.unmount());
  });
  it("does not render any private record for an empty/quarantined read", async () => {
    const ctx = mount([]);
    await act(async () => ctx.root.render(createElement(PendingPreventionNotice, { entries: [] })));
    expect(ctx.div.innerHTML).toBe("");
    await act(async () => ctx.root.unmount());
  });
});
