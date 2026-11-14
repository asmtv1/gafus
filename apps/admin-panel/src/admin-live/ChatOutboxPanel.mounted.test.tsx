// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatOutboxPanel } from "./ChatOutboxPanel";

const mocked = vi.hoisted(() => ({ requestAdmin: vi.fn() }));
vi.mock("./api", () => ({ requestAdmin: mocked.requestAdmin }));

const endpoint = "/api/v1/admin/media/chat-outbox/dead-letters";
const event = {
  id: "evt_1234567890", eventType: "message.created", operationId: "op_12345",
  traceId: "a".repeat(32), attempts: 8, lastErrorCode: "CHAT2_BROKER_AUTH_DENIED",
  deadLetteredAt: "2026-11-11T12:00:00.000Z", createdAt: "2026-11-11T11:00:00.000Z",
};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocked.requestAdmin.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const click = async (button: HTMLButtonElement) => {
  await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

const buttonNamed = (text: string) => {
  const button = [...host.querySelectorAll("button")].find(item => item.textContent?.includes(text));
  expect(button, `Missing button ${text}`).toBeDefined();
  return button as HTMLButtonElement;
};

describe("mounted ADMIN Chat2 outbox recovery", () => {
  it("renders bounded PII-free failures and retries precisely one ID, then reloads", async () => {
    mocked.requestAdmin.mockResolvedValueOnce([event]).mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);
    await act(async () => root.render(<ChatOutboxPanel />));
    expect(mocked.requestAdmin).toHaveBeenCalledWith(endpoint, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(host.textContent).toContain("CHAT2_BROKER_AUTH_DENIED");
    expect(host.textContent).toContain("op_12345");
    expect(host.textContent).not.toContain("conversationId");
    expect(host.querySelectorAll("button")).toHaveLength(2); // refresh + one event; no bulk resend
    await click(buttonNamed("Повторить"));
    expect(mocked.requestAdmin).toHaveBeenNthCalledWith(2, `${endpoint}/${event.id}/retry`, { method: "POST" });
    expect(mocked.requestAdmin).toHaveBeenNthCalledWith(3, endpoint, {});
    expect(host.textContent).toContain("Нет событий, требующих ручного восстановления");
  });

  it("does not claim success after a refused CAS retry; retains the event", async () => {
    mocked.requestAdmin.mockResolvedValueOnce([event]).mockRejectedValueOnce(Error("409"));
    await act(async () => root.render(<ChatOutboxPanel />));
    await click(buttonNamed("Повторить"));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Повтор не выполнен");
    expect(host.textContent).toContain("CHAT2_BROKER_AUTH_DENIED");
    expect(mocked.requestAdmin).toHaveBeenCalledTimes(2);
  });

  it("reports diagnostics outage and supports explicit refresh", async () => {
    mocked.requestAdmin.mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce([event]);
    await act(async () => root.render(<ChatOutboxPanel />));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Не удалось загрузить");
    await click(buttonNamed("Обновить"));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("CHAT2_BROKER_AUTH_DENIED");
  });
});
