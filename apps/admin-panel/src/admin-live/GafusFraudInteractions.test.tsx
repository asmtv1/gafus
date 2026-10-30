// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GafusPanel } from "./GafusPanel";

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./api", () => ({ requestAdmin: mock.request }));
const signals = ["signal-one", "signal-two"].map((id) => ({
  id, kind: "DUPLICATE_REACTION", severity: "HIGH", createdAt: "2026-10-25T09:00:00Z",
  userId: "test-user", entityType: "POST", entityId: "test-post",
}));
let host: HTMLDivElement;
let root: Root;
let saved: ReturnType<typeof vi.fn<() => void>>;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  saved = vi.fn();
  mock.request.mockReset();
  mock.request.mockResolvedValue({});
  vi.stubGlobal("confirm", vi.fn(() => true));
  await act(async () => root.render(
    <GafusPanel tab="fraud" source={signals} onSaved={saved} />,
  ));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function setField(id: string, name: "Результат проверки" | "Списание", value: string) {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${name} ${id}"]`,
  );
  expect(field).not.toBeNull();
  const proto = name === "Списание" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(field, value);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submitSignal(index: number, buttonText: string) {
  const article = host.querySelectorAll("article.moderation-report")[index];
  const button = [...article.querySelectorAll("button")]
    .find((item) => item.textContent?.trim() === buttonText);
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

describe("Gafus fraud signal isolation", () => {
  it("uses the selected signal's own reason and amount", async () => {
    await setField("signal-one", "Результат проверки", "Первая причина");
    await setField("signal-two", "Результат проверки", "Вторая причина");
    await setField("signal-two", "Списание", "2");
    await submitSignal(1, "Подтвердить нарушение");
    expect(mock.request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/admin/gafus-operations/fraud/signal-two/review", {
        method: "POST", body: {
          action: "CONFIRM", reason: "Вторая причина", requestedReversal: 2,
        },
      },
    );
    expect(saved).toHaveBeenCalledOnce();
  });
  it("does not send another signal's reason or invalid reversals", async () => {
    await setField("signal-one", "Результат проверки", "Первая причина");
    await submitSignal(1, "Подтвердить нарушение");
    expect(mock.request).not.toHaveBeenCalled();
    await setField("signal-two", "Результат проверки", "Вторая причина");
    await setField("signal-two", "Списание", "10001");
    await submitSignal(1, "Подтвердить нарушение");
    expect(mock.request).not.toHaveBeenCalled();
    expect(host.textContent).toContain("целую сумму от 0 до 10000");
  });
  it("forces zero reversal for DISMISS even if an amount is entered", async () => {
    await setField("signal-one", "Результат проверки", "Причина отклонения");
    await setField("signal-one", "Списание", "10000");
    await submitSignal(0, "Отклонить сигнал");
    expect(mock.request).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/admin/gafus-operations/fraud/signal-one/review", {
        method: "POST", body: {
          action: "DISMISS", reason: "Причина отклонения", requestedReversal: 0,
        },
      },
    );
  });
});
