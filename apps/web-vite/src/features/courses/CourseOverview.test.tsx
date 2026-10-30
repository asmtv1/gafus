// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseOverview } from "./CourseOverview";
import { courseIdFromPath, coursePath, routeForPath } from "../../shared/router/location";

afterEach(() => vi.unstubAllGlobals());

const course = {
  id: "course-A", name: "Основы общения", type: "basic",
  shortDesc: "Читаем сигналы", duration: "12 дней",
  isPaid: true, isPrivate: false, hasAccess: false,
  isFavorite: false, userStatus: "NOT_STARTED", trainingLevel: "BEGINNER",
  // Backend may include additional fields; the Vite projection must not use these.
  description: "private back-office notes", dayLinks: [{ secret: true }],
};

async function mount({ userId, data, status = 200 }: {
  userId: string | null;
  data: unknown;
  status?: number;
}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    calls.push(path);
    return new Response(JSON.stringify({
      success: status === 200, data, error: "API not available",
    }), { status });
  }));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(createElement(
    QueryClientProvider, { client: queryClient },
    createElement(CourseOverview, { userId, courseId: "course-A" }),
  )));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  return {
    host, calls, async cleanup() {
      await act(async () => root.unmount());
      queryClient.clear();
      host.remove();
    },
  };
}

describe("course catalog-backed overview", () => {
  it("only accepts explicit one-segment course ID paths", () => {
    expect(coursePath("course-A")).toBe("/courses/course-A");
    expect(courseIdFromPath("/courses/course-A")).toBe("course-A");
    expect(routeForPath("/courses/course-A")).toBe("/courses/course-A");
    expect(courseIdFromPath("/courses/../admin")).toBeNull();
    expect(routeForPath("/courses/%2Fsecret")).toBeNull();
    expect(() => coursePath("../secret")).toThrow("Invalid course ID");
  });

  it("unauthenticated direct detail cannot render or query course data", async () => {
    const result = await mount({ userId: null, data: [course] });
    try {
      expect(result.calls).toEqual([]);
      expect(result.host.textContent).toBe("");
      expect(result.host.querySelector(".course-card")).toBeNull();
    } finally { await result.cleanup(); }
  });

  it("authenticated detail uses only existing Hono catalog and server access decision", async () => {
    const result = await mount({
      userId: "user-1", data: [{ ...course, hasAccess: true, isFavorite: true }],
    });
    try {
      expect(result.calls).toEqual(["/api/v1/courses"]);
      expect(result.host.textContent).toContain("Курс доступен");
      expect(result.host.textContent).toContain("Начальный");
      expect(result.host.textContent).toContain("Не начат");
      expect(result.host.textContent).not.toContain("NOT_STARTED");
      expect(result.host.textContent).not.toContain("BEGINNER");
      expect(result.host.textContent).not.toContain("старом Web");
      expect(result.host.querySelector('[aria-label="Убрать из избранного"]')).toBeNull();
      expect(result.host.querySelector('[aria-label="Добавить в избранное"]')).toBeNull();
      expect(result.host.textContent).not.toContain("private back-office notes");
    } finally { await result.cleanup(); }
  });

  it("renders the same translated level and progress as the course cards", async () => {
    const result = await mount({
      userId: "user-1",
      data: [{ ...course, trainingLevel: "ADVANCED", userStatus: "PAUSED",
        hasAccess: false }],
    });
    try {
      expect(result.host.textContent).toContain("Продвинутый");
      expect(result.host.textContent).toContain("Приостановлен");
      expect(result.host.textContent).toContain("Для занятий требуется подписка или назначение");
      expect(result.host.textContent).not.toContain("ADVANCED");
      expect(result.host.textContent).not.toContain("PAUSED");
      expect(result.host.querySelector('a[href^="/trainings/"]')).toBeNull();
    } finally { await result.cleanup(); }
  });

  it("unlisted course ID gets no private data from a verified owner", async () => {
    const result = await mount({ userId: "user-1", data: [] });
    try {
      expect(result.calls).toEqual(["/api/v1/courses"]);
      expect(result.host.textContent).toContain("не найден или недоступен");
      expect(result.host.querySelector(".course-card")).toBeNull();
    } finally { await result.cleanup(); }
  });

  it("API errors show a retry instead of a fabricated empty or unlocked course", async () => {
    const result = await mount({ userId: "user-1", data: null, status: 503 });
    try {
      expect(result.host.querySelector('[role="alert"]')).not.toBeNull();
      expect(result.host.querySelector(".course-card")).toBeNull();
      expect(result.host.textContent).not.toContain("Курс доступен");
    } finally { await result.cleanup(); }
  });
});
