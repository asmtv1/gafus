// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminCacheSection, AdminStorageSection, StoragePanel } from "./SystemPanels";
import { AdminHttpError } from "./api";

const fake = vi.hoisted(() => ({ requestAdmin: vi.fn() }));
vi.mock("./api", () => ({
  requestAdmin: fake.requestAdmin,
  AdminHttpError: class AdminHttpError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  },
}));

const stats = {
  totalExamResults: 24,
  withVideo: 17,
  withoutVideo: 7,
  deletedVideos: 1,
  completedWithVideo: 6,
  pendingWithVideo: 11,
  completedOlderThan30Days: 2,
  pendingOlderThan90Days: 1,
  deletedByReplacement: 1,
  deletedByAutoCleanupCompleted: 0,
  deletedByAutoCleanupPending: 0,
};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fake.requestAdmin.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.trim() === label);
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

describe("ADMIN-1 /media and /admin parity", () => {
  it("retains distinct Next storage groups and 30/90-day retention notes", () => {
    const html = renderToStaticMarkup(<StoragePanel data={stats} />);
    expect(html).toContain("Кандидаты на автоудаление");
    expect(html).toContain("Зачтенные старше 30 дней");
    expect(html).toContain("Незачтенные старше 90 дней");
    expect(html).toContain("03:00 МСК");
    expect(html).not.toContain("Удалить сейчас");
  });

  it("fails closed for negative, fractional and missing storage counters", () => {
    for (const broken of [
      { ...stats, completedWithVideo: -2 },
      { ...stats, withVideo: 1.5 },
      { ...stats, deletedVideos: undefined },
    ]) {
      const html = renderToStaticMarkup(<StoragePanel data={broken} />);
      expect(html).toContain("Некорректный формат статистики хранения видео");
    }
  });

  it("recovers /media statistics through a fresh read-only GET after an error", async () => {
    fake.requestAdmin.mockRejectedValueOnce(new Error("Storage offline"));
    fake.requestAdmin.mockResolvedValueOnce(stats);
    await act(async () => root.render(<AdminStorageSection />));
    expect(host.textContent).toContain("Storage offline");
    await click("Повторить чтение статистики");
    expect(host.textContent).toContain("Кандидаты на автоудаление");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
    expect(fake.requestAdmin.mock.calls[0]?.[0]).toBe("/api/v1/admin/media/stats");
    expect(fake.requestAdmin.mock.calls[1]?.[0]).toBe("/api/v1/admin/media/stats");
  });

  it("recovers /admin cache metrics via GET and never performs a POST on retry", async () => {
    fake.requestAdmin.mockRejectedValueOnce(new Error("Cache offline"));
    fake.requestAdmin.mockResolvedValueOnce({
      scope: "HONO_COURSE_CONTENT", processMetrics: {},
    });
    await act(async () => root.render(<AdminCacheSection canChange={false} />));
    expect(host.textContent).toContain("Cache offline");
    await click("Перечитать состояние кэша");
    expect(host.textContent).toContain("Текущая архитектура кэша");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
    for (const call of fake.requestAdmin.mock.calls) {
      expect(call[0]).toBe("/api/v1/admin/cache");
      expect(call[1]?.method).toBeUndefined();
    }
  });
  it("never blindly retries an unknown cache revision POST, until explicit GET", async () => {
    fake.requestAdmin
      .mockResolvedValueOnce({ scope: "HONO_COURSE_CONTENT" })
      .mockRejectedValueOnce(new Error("Lost POST response"))
      .mockResolvedValueOnce({ scope: "HONO_COURSE_CONTENT" });
    await act(async () => root.render(<AdminCacheSection canChange={true} />));
    await click("Обновить кэш курсов");
    expect(host.textContent).toContain("Ответ на обновление ревизии неизвестен");
    await click("Обновить кэш курсов");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
    await click("Проверить сервер перед новым обновлением");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(3);
    expect(fake.requestAdmin.mock.calls[1]).toEqual([
      "/api/v1/admin/cache/courses/refresh",
      { method: "POST", body: { confirmation: "REFRESH_COURSE_CONTENT" } },
    ]);
    expect(fake.requestAdmin.mock.calls[2]?.[0]).toBe("/api/v1/admin/cache");
    expect(host.textContent).toContain("Результат предыдущего обновления ревизии не установлен");
  });

  it("a malformed verification GET does not authorize a second cache revision write", async () => {
    fake.requestAdmin
      .mockResolvedValueOnce({ scope: "HONO_COURSE_CONTENT" })
      .mockRejectedValueOnce(new Error("Lost ACK"))
      .mockResolvedValueOnce({ bad: true });
    await act(async () => root.render(<AdminCacheSection canChange={true} />));
    await click("Обновить кэш курсов");
    await click("Проверить сервер перед новым обновлением");
    expect(host.textContent).toContain("Некорректный ответ состояния кэша");
    await click("Обновить кэш курсов");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(3);
  });

  it("definitive 409 permits an intentional corrected cache refresh", async () => {
    fake.requestAdmin
      .mockResolvedValueOnce({ scope: "HONO_COURSE_CONTENT" })
      .mockRejectedValueOnce(new AdminHttpError(409, "CONFLICT", "Контроль конфликтов"));
    await act(async () => root.render(<AdminCacheSection canChange={true} />));
    await click("Обновить кэш курсов");
    expect(host.textContent).toContain("Контроль конфликтов");
    expect(host.textContent).not.toContain("Проверить сервер перед новым обновлением");
  });

});
