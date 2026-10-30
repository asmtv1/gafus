// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ list: vi.fn(), resolve: vi.fn() }));
vi.mock("./chat2Api", () => ({
  chat2Api: { staffReports: mock.list, resolveStaffReport: mock.resolve },
}));
import { Chat2StaffQueue } from "./Chat2StaffQueue";

const fixture = {
  id: "r1", reason: "ABUSE", comment: "Оскорбления",
  createdAt: "2026-10-27T10:00:00.000Z",
  conversation: { id: "direct1", kind: "DIRECT", name: null },
  message: { id: "m1", authorId: "sender", text: "Текст жалобы", deletedAt: null },
};
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
async function mount(enabled = true) {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement(Chat2StaffQueue, { enabled }))));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  mock.list.mockResolvedValue([]);
  mock.resolve.mockResolvedValue({ done: true });
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe("Chat2 staff global moderation queue", () => {
  it("only fetches when the staff view is enabled; shows a true empty queue", async () => {
    await mount(false);
    expect(mock.list).not.toHaveBeenCalled();
    await mount(true);
    await vi.waitFor(() => expect(host.textContent).toContain("Новых жалоб нет"));
    expect(mock.list).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("Очередь временно недоступна");
  });

  it("renders personal chat reports and saves a staff decision", async () => {
    mock.list.mockResolvedValueOnce([fixture]).mockResolvedValueOnce([]);
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Личный чат"));
    expect(host.textContent).toContain("Оскорбления");
    expect(host.textContent).toContain("Текст жалобы");
    const button = [...host.querySelectorAll("button")].find((el) =>
      el.textContent === "Обработано");
    expect(button).toBeTruthy();
    await act(async () => button?.click());
    await vi.waitFor(() => expect(mock.resolve).toHaveBeenCalledExactlyOnceWith("r1", "RESOLVED"));
    await vi.waitFor(() => expect(host.textContent).toContain("Решение сохранено"));
    expect(host.textContent).toContain("Новых жалоб нет");
  });

  it("recovers after a temporary loading failure when staff clicks retry", async () => {
    mock.list.mockRejectedValueOnce(new Error("Connection reset")).mockResolvedValueOnce([]);
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Очередь временно недоступна"));
    const button = [...host.querySelectorAll("button")].find((el) => el.textContent === "Повторить");
    expect(button).toBeTruthy();
    await act(async () => button?.click());
    await vi.waitFor(() => expect(host.textContent).toContain("Новых жалоб нет"));
    expect(mock.list).toHaveBeenCalledTimes(2);
  });
});
