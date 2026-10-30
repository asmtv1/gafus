// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedModerationPanel, QuestionsModerationPanel } from "./ModerationPanels";

const fake = vi.hoisted(() => ({ requestAdmin: vi.fn() }));
vi.mock("./api", () => ({
  requestAdmin: fake.requestAdmin,
  AdminHttpError: class AdminHttpError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  },
}));

let root: Root;
let host: HTMLDivElement;
let onSaved: ReturnType<typeof vi.fn<() => void>>;

const report = {
  id: "report1",
  targetType: "post" as const,
  status: "pending",
  author: { username: "writer", feedPublishingBlocked: false },
  reporter: { username: "reader" },
  createdAt: "2026-10-25T10:00:00.000Z",
  reason: "spam",
  comment: null,
  snapshotText: "test moment",
  resolution: null,
  resolutionReason: null,
};
const qReport = {
  id: "qreport1", questionTitle: "Question", answerId: null,
  author: { name: "Author" }, reporter: { name: "Reporter" },
  createdAt: "2026-10-25T10:00:00.000Z", body: "Question body",
  reason: "spam", details: null, photos: [],
};

async function click(text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find((node) => node.textContent?.trim() === text);
  expect(button, text).toBeDefined();
  await act(async () => button?.click());
}
function changeTextarea(value: string) {
  const field = host.querySelector<HTMLTextAreaElement>("textarea");
  expect(field).not.toBeNull();
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  nativeSetter?.call(field, value);
  field?.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onSaved = vi.fn();
  fake.requestAdmin.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("ADMIN-1 moderation: Next parity on readback", () => {
  it("renders the localized feed violation reason from Next types", async () => {
    await act(async () => root.render(
      <FeedModerationPanel
        source={{ items: [report], pendingCount: 1, nextCursor: null }}
        onSaved={onSaved}
      />,
    ));
    expect(host.textContent).toContain("Спам и реклама");
    expect(host.textContent).toContain("Обновить список жалоб");
    expect(fake.requestAdmin).not.toHaveBeenCalled();
  });

  it("keeps feed cursor after mutation and fetches only the current page", async () => {
    fake.requestAdmin.mockResolvedValueOnce({
      items: [report], pendingCount: 1, nextCursor: null,
    });
    fake.requestAdmin.mockResolvedValueOnce({ id: report.id });
    fake.requestAdmin.mockResolvedValueOnce({
      items: [{ ...report, status: "resolved", resolution: "hide" }],
      pendingCount: 0, nextCursor: null,
    });
    await act(async () => root.render(
      <FeedModerationPanel
        source={{ items: [report], pendingCount: 2, nextCursor: "cursor123" }}
        onSaved={onSaved}
      />,
    ));
    await click("Следующая страница");
    await act(async () => changeTextarea("Нарушение правил"));
    await click("Применить решение");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(3);
    expect(fake.requestAdmin).toHaveBeenNthCalledWith(
      1, "/api/v1/admin/moderation/feed/reports?cursor=cursor123",
    );
    expect(fake.requestAdmin).toHaveBeenNthCalledWith(
      2, "/api/v1/admin/moderation/feed/reports/report1",
      { method: "POST", body: { action: "hide", reason: "Нарушение правил" } },
    );
    expect(fake.requestAdmin).toHaveBeenNthCalledWith(
      3, "/api/v1/admin/moderation/feed/reports?cursor=cursor123",
    );
    expect(host.textContent).toContain("Назад");
    expect(host.textContent).toContain("Рассмотрена");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("reads back question-block removal once, without an extra root reset", async () => {
    fake.requestAdmin.mockResolvedValueOnce({ userId: "user1" });
    fake.requestAdmin.mockResolvedValueOnce({ reports: [qReport], blocks: [], nextPage: null });
    await act(async () => root.render(
      <QuestionsModerationPanel
        source={{
          reports: [qReport],
          blocks: [{ userId: "user1", name: "Author", reason: "spam" }],
          nextPage: null,
        }}
        onSaved={onSaved}
      />,
    ));
    await click("Снять блокировку");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
    expect(fake.requestAdmin).toHaveBeenNthCalledWith(
      1, "/api/v1/admin/moderation/questions/blocks/user1", { method: "DELETE" },
    );
    expect(fake.requestAdmin).toHaveBeenNthCalledWith(
      2, "/api/v1/admin/moderation/questions/reports",
    );
    expect(host.textContent).toContain("Блокировок нет");
    expect(onSaved).not.toHaveBeenCalled();
  });
  it("prevents a blind repeat of a feed POST after unknown transport ACK", async () => {
    fake.requestAdmin.mockRejectedValueOnce(new Error("connection dropped"));
    fake.requestAdmin.mockResolvedValueOnce({
      items: [report], pendingCount: 1, nextCursor: null,
    });
    await act(async () => root.render(
      <FeedModerationPanel
        source={{ items: [report], pendingCount: 1, nextCursor: null }}
        onSaved={onSaved}
      />,
    ));
    await act(async () => changeTextarea("Нарушение правил"));
    await click("Применить решение");
    expect(host.textContent).toContain("Результат решения неизвестен");
    await click("Применить решение");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(1);
    await click("Перечитать жалобу на сервере");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
    expect(fake.requestAdmin).toHaveBeenLastCalledWith(
      "/api/v1/admin/moderation/feed/reports",
    );
    expect(host.textContent).not.toContain("Результат решения неизвестен");
  });

  it("blocks unknown question moderation writes until server GET succeeds", async () => {
    fake.requestAdmin.mockRejectedValueOnce(new Error("network down"));
    fake.requestAdmin.mockResolvedValueOnce({ reports: [qReport], blocks: [], nextPage: null });
    await act(async () => root.render(
      <QuestionsModerationPanel
        source={{ reports: [qReport], blocks: [], nextPage: null }}
        onSaved={onSaved}
      />,
    ));
    await click("Скрыть публикацию");
    expect(host.textContent).toContain("Результат изменения неизвестен");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(1);
    await click("Скрыть публикацию");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(1);
    await click("Перечитать модерацию на сервере");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
    expect(fake.requestAdmin).toHaveBeenLastCalledWith(
      "/api/v1/admin/moderation/questions/reports",
    );
  });

  it("rejects malformed moderation DTOs instead of rendering partial privileged content", async () => {
    await act(async () => root.render(
      <FeedModerationPanel
        source={{ items: [{ ...report, author: {} }], pendingCount: 1, nextCursor: null }}
        onSaved={onSaved}
      />,
    ));
    expect(host.textContent).toContain("Неверный формат жалоб Моментов");
    await act(async () => root.render(
      <QuestionsModerationPanel
        source={{
          reports: [{ ...qReport, photos: [{ id: "photo1", url: 7 }] }],
          blocks: [], nextPage: null,
        }}
        onSaved={onSaved}
      />,
    ));
    expect(host.textContent).toContain("Некорректный список модерации вопросов");
  });

  it("does not unlock a feed write after malformed server verification data", async () => {
    fake.requestAdmin.mockRejectedValueOnce(new Error("POST response lost"));
    fake.requestAdmin.mockResolvedValueOnce({
      items: [{ ...report, author: null, reporter: {} }],
      pendingCount: 1, nextCursor: null,
    });
    fake.requestAdmin.mockResolvedValueOnce({
      items: [report], pendingCount: 1, nextCursor: null,
    });
    await act(async () => root.render(
      <FeedModerationPanel
        source={{ items: [report], pendingCount: 1, nextCursor: null }}
        onSaved={onSaved}
      />,
    ));
    await act(async () => changeTextarea("Нарушение правил"));
    await click("Применить решение");
    await click("Перечитать жалобу на сервере");
    expect(host.textContent).toContain("Некорректный ответ списка жалоб");
    expect(host.querySelector<HTMLButtonElement>("button:not(.secondary)")?.disabled).toBeDefined();
    await click("Применить решение");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
    await click("Перечитать жалобу на сервере");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(3);
    expect(host.textContent).not.toContain("Результат решения неизвестен");
  });

  it("deduplicates overlapping question pages by report ID", async () => {
    fake.requestAdmin.mockResolvedValueOnce({
      reports: [qReport, { ...qReport, id: "qreport2", questionTitle: "Another question" }],
      blocks: [], nextPage: null,
    });
    await act(async () => root.render(
      <QuestionsModerationPanel
        source={{ reports: [qReport], blocks: [], nextPage: 2 }}
        onSaved={onSaved}
      />,
    ));
    await click("Ещё жалобы");
    expect(host.querySelectorAll("article.moderation-report")).toHaveLength(2);
    expect(host.textContent).toContain("Another question");
  });

});
