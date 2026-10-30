// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentCommentCard } from "./MomentCommentCard";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { MomentComment } from "./momentsApi";

const userId = "actor-1";
const comment: MomentComment = {
  id: "comment-1", text: "Чужой комментарий",
  authorName: "Кинолог", username: "trainer", roleBadge: null,
  createdAt: "2026-10-26T12:00:00.000Z", editedAt: null, deleted: false,
  rootId: null, replyToName: null, replyToId: null, replyCount: 0,
  canEdit: false, canDelete: false, myReaction: null, reactions: [],
};
const response = (data: unknown, status = 200) => new Response(JSON.stringify({
  success: status === 200, data, error: "Forbidden",
}), { status });
async function mount(record: MomentComment, requester: ReturnType<typeof vi.fn>) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", requester);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  query.setQueryData(CURRENT_USER_QUERY_KEY, { id: userId, username: "viewer", role: "USER" });
  await act(async () => root.render(createElement(QueryClientProvider, { client: query },
    createElement(MomentCommentCard, { comment: record, userId,
      postId: "post-1", rootId: record.id, onReply: vi.fn() }))));
  const click = async (label: string) => {
    const btn = [...host.querySelectorAll("button")].find(item =>
      item.textContent?.trim() === label);
    expect(btn, label).toBeDefined();
    await act(async () => btn?.click());
  };
  const submit = async () => {
    const form = host.querySelector<HTMLFormElement>('form[aria-label="Жалоба на комментарий"]');
    expect(form).not.toBeNull();
    await act(async () => form?.dispatchEvent(new Event("submit", {
      bubbles: true, cancelable: true,
    })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  };
  return { host, query, click, submit, cleanup: async () => {
    await act(async () => root.unmount()); query.clear(); host.remove();
  }};
}
afterEach(() => vi.unstubAllGlobals());

describe("WEB4 Next source foreign-comment report parity via Core report receipt", () => {
  it("renders source edited marker and targeted reply without exposing owner controls", async () => {
    const fake = vi.fn();
    const ui = await mount({
      ...comment, editedAt: "2026-10-26T12:05:00.000Z", replyToName: "Собаковод",
    }, fake);
    try {
      expect(ui.host.textContent).toContain("Изменён");
      expect(ui.host.textContent).toContain("Ответ для Собаковод");
      expect(ui.host.querySelector('[aria-label="Редактировать комментарий"]')).toBeNull();
      expect(ui.host.querySelector('[aria-label="Удалить комментарий"]')).toBeNull();
      expect(fake).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });
  it("foreign comment opens report, cancel writes nothing", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "report-1" }));
    const ui = await mount(comment, fake);
    try {
      await ui.click("Пожаловаться");
      expect(ui.host.querySelector('[aria-label="Жалоба на комментарий"]')).not.toBeNull();
      await ui.click("Отмена");
      expect(ui.host.querySelector('[aria-label="Жалоба на комментарий"]')).toBeNull();
      expect(fake).not.toHaveBeenCalled();
    } finally { await ui.cleanup(); }
  });
  it("real report endpoint accepts one receipt; never sends second request", async () => {
    const fake = vi.fn().mockResolvedValue(response({ id: "report-new-1" }));
    const ui = await mount(comment, fake);
    try {
      await ui.click("Пожаловаться");
      await ui.submit();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(fake.mock.calls[0]![0]).toBe("/api/v1/feed/comments/comment-1/report");
      expect(fake.mock.calls[0]![1]?.method).toBe("POST");
      expect(JSON.parse(String(fake.mock.calls[0]![1]?.body))).toEqual({
        reason: "spam", comment: "",
      });
      expect(ui.host.textContent).toContain("Жалоба отправлена на рассмотрение.");
      expect(ui.host.textContent).not.toContain("Пожаловаться");
    } finally { await ui.cleanup(); }
  });
  it.each([401, 403, 404, 409, 503])("HTTP%s denial/lost ACK never claims sent and never auto-retries", async status => {
    const fake = vi.fn().mockResolvedValue(response(null, status));
    const ui = await mount(comment, fake);
    try {
      await ui.click("Пожаловаться");
      await ui.submit();
      expect(fake).toHaveBeenCalledTimes(1);
      expect(ui.host.textContent).toContain("Не удалось подтвердить жалобу.");
      expect(ui.host.textContent).not.toContain("Жалоба отправлена на рассмотрение.");
      await ui.submit();
      expect(fake).toHaveBeenCalledTimes(1);
    } finally { await ui.cleanup(); }
  });
  it("own, deleted or unverifiable author never renders complaint operation", async () => {
    const fake = vi.fn();
    for (const record of [
      { ...comment, username: "viewer", canDelete: true, canEdit: true },
      { ...comment, deleted: true },
      { ...comment, username: "viewer" },
    ]) {
      const ui = await mount(record, fake);
      try { expect(ui.host.textContent).not.toContain("Пожаловаться"); }
      finally { await ui.cleanup(); }
    }
    expect(fake).not.toHaveBeenCalled();
  });
  it("retired actor while report dialog open cannot submit another user's report", async () => {
    const fake = vi.fn();
    const ui = await mount(comment, fake);
    try {
      await ui.click("Пожаловаться");
      expect(ui.host.querySelector('[aria-label="Жалоба на комментарий"]')).not.toBeNull();
      await act(async () => ui.query.setQueryData(CURRENT_USER_QUERY_KEY,
        { id: "actor-3", username: "other-user", role: "USER" }));
      await ui.submit();
      expect(fake).not.toHaveBeenCalled();
      expect(ui.host.textContent).not.toContain("Жалоба отправлена на рассмотрение.");
    } finally { await ui.cleanup(); }
  });
  it("foreign comment with moderator delete permission still exposes report", async () => {
    const fake = vi.fn();
    const ui = await mount({ ...comment, canDelete: true }, fake);
    try { expect(ui.host.textContent).toContain("Пожаловаться"); }
    finally { await ui.cleanup(); }
    expect(fake).not.toHaveBeenCalled();
  });
});
