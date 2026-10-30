// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCatalog, courseLevelLabel, courseProgressLabel } from "./CourseCatalog";
import { FavoriteCourseButton } from "./FavoriteCourseButton";

const sampleCourse = {
  id: "course-1",
  name: "Тренировка внимания",
  type: "attention",
  shortDesc: "Упражнения на концентрацию",
  duration: "12 дней",
  isPaid: true,
  isPrivate: false,
  hasAccess: false,
  isFavorite: false,
  userStatus: "NOT_STARTED",
  trainingLevel: "BEGINNER",
};

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

async function renderAs(userId: string | null, withDetailFavorite = false) {
  await act(async () => {
    root.render(createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement("div", null,
        createElement(CourseCatalog, { userId }),
        withDetailFavorite && userId && createElement(FavoriteCourseButton, {
          userId, courseId: sampleCourse.id, isFavorite: false,
        }),
      ),
    ));
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}

function apiResult(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ success: status === 200, data, error: "Unavailable" }),
    { status },
  );
}

describe("isolated courses screen", () => {
  it("shares Russian course labels and keeps unexpected runtime values private", () => {
    expect(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].map(courseLevelLabel))
      .toEqual(["Начальный", "Средний", "Продвинутый", "Экспертный"]);
    expect(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "PAUSED", "RESET"]
      .map(courseProgressLabel))
      .toEqual(["Не начат", "В процессе", "Пройден", "Приостановлен", "Сброшен"]);
    for (const unknown of ["NEW_LEVEL", "NEW_STATUS", "toString", "__proto__", null, 1]) {
      expect(courseLevelLabel(unknown)).toBe("Уровень не указан");
      expect(courseProgressLabel(unknown)).toBe("Нет данных о прогрессе");
    }
  });
  it("renders only server-provided access, level, favorites and progress", async () => {
    const mocked = vi.fn().mockResolvedValue(apiResult([sampleCourse]));
    vi.stubGlobal("fetch", mocked);
    await renderAs("user-1");
    expect(container.textContent).toContain("Тренировка внимания");
    expect(container.textContent).toContain("Начальный");
    expect(container.textContent).toContain("Не начат");
    expect(container.textContent).toContain("По подписке");
    expect(container.querySelector(".course-card .access-tag")).toBeNull();
    expect(container.textContent).toContain("12 дней");
    expect(container.textContent).not.toContain("Доступ и прогресс определяются сервером");
    expect(container.textContent).not.toContain("Hono API");
    expect(container.textContent).not.toContain("optimistic update");
    expect(container.textContent).not.toContain("Доступен");
    expect(container.querySelector("li.course-card a[href='/trainings/attention']")).not.toBeNull();
    expect(container.querySelector("li.course-card a[href='/courses/course-1']")).toBeNull();
    expect(container.querySelectorAll(".course-card [class*=factIcon]")).toHaveLength(3);
    expect(container.querySelector(".course-card .course-favorite")).toBeNull();
  });

  it("renders legacy image/png .blob URLs as covers for both paid courses", async () => {
    const prefix = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/trainer123/courses/";
    const a = "0478ee02-df96-4f9d-8e30-e050e002faf5";
    const b = "798a7d39-3491-4ff1-bab8-252afe96871d";
    const courses = [
      { ...sampleCourse, id: "course-a", type: "course-a",
        name: "Неподбор с земли", logoImg: `${prefix}${a}/${a}.blob` },
      { ...sampleCourse, id: "course-b", type: "course-b",
        name: "Собака и дети: безопасная дружба", logoImg: `${prefix}${b}/${b}.blob` },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResult(courses)));
    await renderAs("user-1");
    for (const item of courses) {
      const img = container.querySelector<HTMLImageElement>(
        `img[alt="Обложка курса «${item.name}»"]`,
      );
      expect(img?.getAttribute("src")).toBe(item.logoImg);
    }
    expect(container.querySelectorAll(".gafus-missing-course-cover")).toHaveLength(0);
  });

  it("detail favorite action refetches server state only after successful write", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(apiResult([sampleCourse]))
      .mockResolvedValueOnce(apiResult({ isFavorite: true }))
      .mockResolvedValueOnce(apiResult([{ ...sampleCourse, isFavorite: true }]));
    vi.stubGlobal("fetch", fetcher);
    await renderAs("user-1", true);
    const favorite = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Добавить в избранное"]',
    );
    expect(favorite).not.toBeNull();
    await act(async () => favorite?.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/courses/favorites");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
      courseId: sampleCourse.id, action: "add",
    });
    expect((queryClient.getQueryData(["courses", "catalog", "user-1"]) as typeof sampleCourse[])[0]?.isFavorite).toBe(true);
    // Source Next hides favorite from the course card; detail controls use
    // the revalidated GET state rather than an optimistic local favorite.
  });

  it("detail favorite failed write preserves state and exposes an error", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(apiResult([sampleCourse]))
      .mockResolvedValueOnce(apiResult(null, 503));
    vi.stubGlobal("fetch", fetcher);
    await renderAs("user-1", true);
    await act(async () => container.querySelector<HTMLButtonElement>(
      'button[aria-label="Добавить в избранное"]',
    )?.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[aria-pressed="false"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Не удалось");
  });

  it("renders source Next participants and start date only when Core returns them", async () => {
    const mocked = vi.fn().mockResolvedValue(apiResult([{
      ...sampleCourse, startedUsersCount: 21, startedAt: "2026-10-24T10:00:00.000Z",
      completedAt: null,
    }]));
    vi.stubGlobal("fetch", mocked);
    await renderAs("user-1");
    expect(container.textContent).toContain("Этот курс уже прошли 21 человек");
    expect(container.textContent).toContain("Начат:");
    expect(container.textContent).not.toContain("Завершен:");
    expect(container.querySelectorAll(".course-card [class*=participantsIcon]")).toHaveLength(1);
  });

  it("unverified principal cannot mount catalog or fetch any course", async () => {
    const mocked = vi.fn();
    vi.stubGlobal("fetch", mocked);
    await renderAs(null);
    expect(mocked).not.toHaveBeenCalled();
    expect(container.querySelector(".course-card")).toBeNull();
    expect(container.querySelector('[aria-label="Каталог курсов"]')).toBeNull();
  });

  it("renders a genuine empty state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResult([])));
    await renderAs("user-1");
    expect(container.textContent).toContain("пока нет доступных курсов");
    expect(container.querySelectorAll(".course-card")).toHaveLength(0);
  });

  it("shows a retriable failure and never displays fake offline catalog", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(apiResult(null, 503))
      .mockResolvedValueOnce(apiResult([sampleCourse]));
    vi.stubGlobal("fetch", mocked);
    await renderAs("user-1");
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    await act(async () => {
      container.querySelector("button")?.click();
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain(sampleCourse.name);
  });

  it("never displays previous user's private catalog during account switch", async () => {
    const mocked = vi.fn()
      .mockResolvedValueOnce(apiResult([{ ...sampleCourse, name: "Только пользователь А" }]))
      .mockResolvedValueOnce(apiResult([]));
    vi.stubGlobal("fetch", mocked);
    await renderAs("user-A");
    expect(container.textContent).toContain("Только пользователь А");
    await renderAs("user-B");
    expect(container.textContent).not.toContain("Только пользователь А");
    expect(container.textContent).toContain("пока нет доступных курсов");
    expect(queryClient.getQueryData(["courses", "catalog", "user-A"])).toBeDefined();
    expect(queryClient.getQueryData(["courses", "catalog", "user-B"])).toEqual([]);
  });
});
