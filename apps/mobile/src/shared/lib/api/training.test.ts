import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./client";
import { projectPublicPaidCourseOutline, trainingApi } from "./training";

vi.mock("./client", () => ({
  apiClient: vi.fn(),
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));

describe("trainingApi", () => {
  beforeEach(() => {
    vi.mocked(apiClient).mockResolvedValue({ success: true, data: undefined });
  });

  it("does not open the global paywall while passively loading diary entries", async () => {
    await trainingApi.getDiaryEntries("course-1");

    expect(apiClient).toHaveBeenCalledWith("/api/v1/training/diary?courseId=course-1", {
      suppressSubscriptionPaywall: true,
    });
  });

  describe("Web-parity public paid course outline", () => {
    const base = {
      courseId: "course1", courseType: "basic", name: "Курс",
      description: "Описание", equipment: "поводок", trainingLevel: "BEGINNER",
      outline: [
        { id: "day2", title: "Второй день", order: 2 },
        { id: "day1", title: "Первый день", order: 1 },
      ],
    };

    it("does not trigger global paywall for the days GET", async () => {
      vi.mocked(apiClient).mockClear();
      vi.mocked(apiClient).mockResolvedValueOnce({
        success: false, code: "SUBSCRIPTION_REQUIRED", error: "Нужна подписка",
      });
      const result = await trainingApi.getDays("basic");
      expect(result.code).toBe("SUBSCRIPTION_REQUIRED");
      expect(apiClient).toHaveBeenCalledExactlyOnceWith(
        "/api/v1/training/days?type=basic", { suppressSubscriptionPaywall: true },
      );
    });

    it("requests Web's public outline without credentials or subscription popup", async () => {
      const guard = vi.fn(() => true);
      const mock = vi.mocked(apiClient);
      mock.mockClear();
      mock.mockResolvedValueOnce({ success: true, data: base });
      const result = await trainingApi.getPublicPaidCourseOutline("basic", guard);
      expect(result).toEqual({ success: true, data: base });
      expect(mock).toHaveBeenCalledExactlyOnceWith(
        "/api/v1/public/paid-course-outline/basic", {
          skipAuth: true, suppressSubscriptionPaywall: true, requestGuard: guard,
        },
      );
    });

    it("rejects private/non-paid marketing response and invalid course IDs", async () => {
      const mock = vi.mocked(apiClient);
      mock.mockClear();
      mock.mockResolvedValueOnce({ success: false, code: "NOT_FOUND",
        error: "Курс не найден" });
      expect(await trainingApi.getPublicPaidCourseOutline("basic"))
        .toEqual({ success: false, code: "NOT_FOUND", error: "Курс не найден" });
      expect(await trainingApi.getPublicPaidCourseOutline("../private"))
        .toMatchObject({ success: false, code: "INVALID_COURSE_TYPE" });
      expect(mock).toHaveBeenCalledTimes(1);
    });

    it("rejects malformed successful response without returning private transport", async () => {
      vi.mocked(apiClient).mockClear();
      vi.mocked(apiClient).mockResolvedValueOnce({ success: true,
        data: { ...base, courseType: "private", secret: "PRIVATE_META" } });
      const result = await trainingApi.getPublicPaidCourseOutline("basic");
      expect(result).toMatchObject({ success: false, code: "INVALID_PUBLIC_PAID_OUTLINE" });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_META");
    });

    it("projects only vetted day titles; rejects malformed/mismatched rows", () => {
      expect(projectPublicPaidCourseOutline({ ...base, ignored: "SECRET" }, "basic"))
        .toEqual(base);
      for (const data of [
        { ...base, courseType: "private" },
        { ...base, outline: [{ id: "a", order: 1, title: "Day" },
          { id: "a", order: 2, title: "Same id" }] },
        { ...base, outline: [{ id: "../bad", title: "day", order: 1 }] },
        { ...base, outline: [{ id: "a", title: "day", order: -1 }] },
        { ...base, outline: [{ id: "a", title: "day", order: 1, estimatedDuration: -5 }] },
      ]) expect(() => projectPublicPaidCourseOutline(data, "basic")).toThrow();
    });
  });

  describe("native online progress backward compatibility", () => {
    const cuid = {
      courseId: "clwcourse00000000000000001",
      dayOnCourseId: "clwdayoc0000000000000001",
      stepIndex: 2,
    };

    it("keeps the exact CUID start → pause → resume → practice/theory complete wire and void ACK", async () => {
      const client = vi.mocked(apiClient);
      client.mockClear();
      client.mockResolvedValue({ success: true });

      const acknowledgements = [
        await trainingApi.startStep({ ...cuid, status: "IN_PROGRESS", durationSec: 90 }),
        await trainingApi.pauseStep({ ...cuid, timeLeftSec: 45 }),
        await trainingApi.resumeStep(cuid),
        await trainingApi.completePracticeStep({ ...cuid, stepTitle: "Практика", stepOrder: 2 }),
        await trainingApi.completeTheoryStep({ ...cuid, stepTitle: "Теория", stepOrder: 2 }),
      ];

      expect(acknowledgements).toStrictEqual([
        { success: true },
        { success: true },
        { success: true },
        { success: true },
        { success: true },
      ]);
      expect(client.mock.calls).toStrictEqual([
        [
          "/api/v1/training/step/start",
          {
            method: "POST",
            body: { ...cuid, status: "IN_PROGRESS", durationSec: 90 },
            suppressSubscriptionPaywall: true,
          },
        ],
        [
          "/api/v1/training/step/pause",
          {
            method: "POST",
            body: { ...cuid, timeLeftSec: 45 },
            suppressSubscriptionPaywall: true,
          },
        ],
        [
          "/api/v1/training/step/resume",
          {
            method: "POST",
            body: cuid,
            suppressSubscriptionPaywall: true,
          },
        ],
        [
          "/api/v1/training/step/complete/practice",
          {
            method: "POST",
            body: { ...cuid, stepTitle: "Практика", stepOrder: 2 },
            suppressSubscriptionPaywall: true,
          },
        ],
        [
          "/api/v1/training/step/complete/theory",
          {
            method: "POST",
            body: { ...cuid, stepTitle: "Теория", stepOrder: 2 },
            suppressSubscriptionPaywall: true,
          },
        ],
      ]);
    });

    it("preserves UUID courseId, zero timer values and omitted completion metadata", async () => {
      const client = vi.mocked(apiClient);
      client.mockClear();
      client.mockResolvedValue({ success: true });
      const identifiers = {
        courseId: "550e8400-e29b-41d4-a716-446655440000",
        dayOnCourseId: "clwdayoc0000000000000001",
        stepIndex: 0,
      };

      await trainingApi.startStep({ ...identifiers, status: "IN_PROGRESS", durationSec: 0 });
      await trainingApi.pauseStep({ ...identifiers, timeLeftSec: 0 });
      await trainingApi.resumeStep(identifiers);
      await trainingApi.completePracticeStep(identifiers);
      await trainingApi.completeTheoryStep(identifiers);

      expect(client.mock.calls).toStrictEqual([
        [
          "/api/v1/training/step/start",
          {
            method: "POST",
            body: { ...identifiers, status: "IN_PROGRESS", durationSec: 0 },
            suppressSubscriptionPaywall: true,
          },
        ],
        [
          "/api/v1/training/step/pause",
          {
            method: "POST",
            body: { ...identifiers, timeLeftSec: 0 },
            suppressSubscriptionPaywall: true,
          },
        ],
        [
          "/api/v1/training/step/resume",
          {
            method: "POST",
            body: identifiers,
            suppressSubscriptionPaywall: true,
          },
        ],
        [
          "/api/v1/training/step/complete/practice",
          {
            method: "POST",
            body: identifiers,
            suppressSubscriptionPaywall: true,
          },
        ],
        [
          "/api/v1/training/step/complete/theory",
          {
            method: "POST",
            body: identifiers,
            suppressSubscriptionPaywall: true,
          },
        ],
      ]);
    });

    it("returns existing permission/conflict/not-found/server refusal envelopes unchanged", async () => {
      const client = vi.mocked(apiClient);
      client.mockClear();
      const operations = [
        {
          run: () =>
            trainingApi.startStep({ ...cuid, status: "IN_PROGRESS" as const, durationSec: 90 }),
          response: {
            success: false,
            error: "Для действия нужна подписка или доступ к шагу за просмотр рекламы",
            code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
          },
          path: "/api/v1/training/step/start",
        },
        {
          run: () => trainingApi.pauseStep({ ...cuid, timeLeftSec: 30 }),
          response: { success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" },
          path: "/api/v1/training/step/pause",
        },
        {
          run: () => trainingApi.resumeStep(cuid),
          response: {
            success: false,
            error: "Состояние шага уже изменилось. Обновите страницу.",
            code: "INVALID_STATE",
          },
          path: "/api/v1/training/step/resume",
        },
        {
          run: () => trainingApi.completePracticeStep(cuid),
          response: { success: false, error: "Шаг не найден", code: "NOT_FOUND" },
          path: "/api/v1/training/step/complete/practice",
        },
        {
          run: () => trainingApi.completeTheoryStep(cuid),
          response: { success: false, error: "Внутренняя ошибка сервера" },
          path: "/api/v1/training/step/complete/theory",
        },
      ];

      for (const operation of operations) {
        client.mockResolvedValueOnce(operation.response);
        const before = client.mock.calls.length;
        expect(await operation.run()).toStrictEqual(operation.response);
        expect(client.mock.calls).toHaveLength(before + 1);
        expect(client.mock.calls[before]?.[0]).toBe(operation.path);
        expect(client.mock.calls[before]?.[1]).toMatchObject({
          method: "POST",
          suppressSubscriptionPaywall: true,
        });
      }
      expect(client).toHaveBeenCalledTimes(operations.length);
    });
  });
});
