/**
 * AG1 cont137 only NEW acceptance:
 * ACTUAL registered Hono signed JWT -> ACTUAL Core getExamResults ->
 * synthetic Prisma two author-owned relation queries. Not real SQL/HTTP
 * socket/browser/provider, no Core mock and no other old suite repeats.
 */
import { randomBytes } from "node:crypto";
import { act, createElement } from "react";
import { TrainerExamSummaryRead20261022 } from "./TrainerExamSummaryRead20261022";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const store = vi.hoisted(() => ({
  find: vi.fn(),
  session: vi.fn(),
  registration: vi.fn(),
  writes: vi.fn(),
  unrelated: vi.fn(),
  rateHits: [] as string[],
  blockRate: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60000;
    init(options: { windowMs: number }) {
      this.windowMs = options.windowMs;
    }
    async increment(key: string) {
      store.rateHits.push(key);
      return {
        totalHits: store.blockRate ? 101 : 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
    async decrement() {
      return undefined;
    }
    async resetKey() {
      return undefined;
    }
  },
}));
vi.mock("@gafus/prisma", async (original) => {
  const actual = await original<typeof PrismaModule>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      user: { ...actual.prisma.user, findUnique: store.session },
      examResult: {
        ...actual.prisma.examResult,
        findMany: store.find,
        create: store.writes,
        update: store.writes,
        delete: store.writes,
      },
      $transaction: store.writes,
    },
  };
});
vi.mock("@gafus/core/services/auth", async (original) => ({
  ...(await original<object>()),
  isRegistrationCompleted: store.registration,
}));
// Intentionally ACTUAL getExamResults from @gafus/core/services/exam.
const { app } = await vi.importActual<{
  app: { request: (path: string, init?: RequestInit) => Promise<Response> };
}>("../../../api/src/app");
const { generateAccessToken } = await vi.importActual<{
  generateAccessToken: (a: { id: string; username: string; role: string }) => Promise<string>;
}>("@gafus/auth/jwt");

const PRIVATE = "AG1_SENTINEL_PRIVATE_STUDENT_EMAIL_MEDIA_TEST_ANSWERS";
const actors = {
  A: { id: "ag1-exam-a", username: "trainer-a", role: "TRAINER" },
  B: { id: "ag1-exam-b", username: "trainer-b", role: "TRAINER" },
  ADMIN: { id: "ag1-exam-admin", username: "admin", role: "ADMIN" },
  MOD: { id: "ag1-exam-mod", username: "mod", role: "MODERATOR" },
  USER: { id: "ag1-exam-user", username: "user", role: "USER" },
  PARTNER: { id: "ag1-exam-partner", username: "partner", role: "PARTNER" },
} as const;
const jwt: Record<string, string> = {};
type F = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  userStep: unknown;
  dailyCourseUserStep: unknown;
  isPassed: boolean | null;
  testAnswers: unknown;
  testScore: number | null;
  testMaxScore: number | null;
  videoReportUrl: string | null;
  writtenFeedback: string | null;
  overallScore: number | null;
  trainerComment: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  reviewedBy: unknown;
};
const make = (
  name: string,
  owner: string,
  variant: "regular" | "daily",
  created: string,
  status: "IN_PROGRESS" | "COMPLETED" | "NOT_STARTED",
  flags: [boolean, boolean, boolean],
  isPassed: boolean | null,
): F => {
  const step = {
    id: "step-" + name,
    title: "Step " + name,
    type: "EXAMINATION",
    hasTestQuestions: flags[0],
    requiresWrittenFeedback: flags[1],
    requiresVideoReport: flags[2],
    checklist: PRIVATE,
  };
  const user = {
    id: "STUDENT-" + name,
    username: PRIVATE,
    profile: {
      fullName: PRIVATE,
      avatarUrl: PRIVATE,
    },
    email: PRIVATE,
  };
  const common = {
    id: name,
    createdAt: new Date(created),
    updatedAt: new Date(created),
    isPassed,
    testAnswers: { private: PRIVATE },
    testScore: 75,
    testMaxScore: 100,
    videoReportUrl: PRIVATE,
    writtenFeedback: PRIVATE,
    overallScore: 76,
    trainerComment: PRIVATE,
    reviewedAt: new Date(created),
    reviewedById: PRIVATE,
    reviewedBy: { id: PRIVATE, username: PRIVATE, profile: null },
  };
  if (variant === "regular") {
    return {
      ...common,
      dailyCourseUserStep: null,
      userStep: {
        id: "userstep-" + name,
        status,
        userTraining: {
          id: PRIVATE,
          user,
          dayOnCourse: {
            id: PRIVATE,
            day: { id: PRIVATE, title: PRIVATE },
            course: {
              id: "course-" + name,
              name: "Course " + name,
              authorId: owner,
              type: "training",
            },
          },
        },
        stepOnDay: { id: PRIVATE, order: 1, step },
      },
    };
  }
  return {
    ...common,
    userStep: null,
    dailyCourseUserStep: {
      id: "daily-step-" + name,
      status,
      dailyCourseUserTraining: {
        id: PRIVATE,
        user,
        schedule: {
          id: "schedule-" + name,
          bundle: { id: "bundle-" + name, title: "Daily Bundle " + name, authorId: owner },
        },
      },
      bundleStep: { id: "bundle-step-" + name, order: 1, step },
    },
  };
};
const data: F[] = [
  make(
    "a-old",
    actors.A.id,
    "regular",
    "2026-10-20T09:00:00Z",
    "COMPLETED",
    [true, false, false],
    false,
  ),
  make(
    "b-new",
    actors.B.id,
    "regular",
    "2026-10-22T09:00:00Z",
    "IN_PROGRESS",
    [false, true, false],
    true,
  ),
  make(
    "a-daily",
    actors.A.id,
    "daily",
    "2026-10-22T12:00:00Z",
    "IN_PROGRESS",
    [false, false, true],
    true,
  ),
  make(
    "b-daily",
    actors.B.id,
    "daily",
    "2026-10-21T08:00:00Z",
    "COMPLETED",
    [true, true, false],
    false,
  ),
  make(
    "a-tie",
    actors.A.id,
    "regular",
    "2026-10-22T12:00:00Z",
    "COMPLETED",
    [false, true, true],
    null,
  ),
];
type Query = { where: Record<string, unknown>; orderBy: { createdAt: string }; include: unknown };
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [key, a] of Object.entries(actors)) jwt[key] = await generateAccessToken(a);
});
beforeEach(() => {
  vi.clearAllMocks();
  store.blockRate = false;
  store.rateHits.length = 0;
  store.registration.mockResolvedValue(true);
  store.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role } : null;
  });
  store.find.mockImplementation(async (query: Query) => {
    const isRegular = "userStep" in query.where;
    const path = isRegular
      ? (
          query.where.userStep as {
            userTraining: { dayOnCourse: { course: { authorId?: string } } };
          }
        ).userTraining.dayOnCourse.course
      : (
          query.where.dailyCourseUserStep as {
            dailyCourseUserTraining: { schedule: { bundle: { authorId?: string } } };
          }
        ).dailyCourseUserTraining.schedule.bundle;
    const owner = path.authorId;
    return data
      .filter((row) => {
        const correct = isRegular ? row.userStep !== null : row.dailyCourseUserStep !== null;
        const rowOwner = isRegular
          ? (
              row.userStep as {
                userTraining: { dayOnCourse: { course: { authorId: string } } };
              } | null
            )?.userTraining.dayOnCourse.course.authorId
          : (
              row.dailyCourseUserStep as {
                dailyCourseUserTraining: { schedule: { bundle: { authorId: string } } };
              } | null
            )?.dailyCourseUserTraining.schedule.bundle.authorId;
        return correct && (!owner || owner === rowOwner);
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });
});
const { JSDOM } = await vi.importActual<{
  JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis };
}>("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { createRoot } = await import("react-dom/client");
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function mount(who: "A" | "ADMIN" | "MOD" = "A", current = true) {
  const a = actors[who];
  const actor = { id: a.id, role: a.role };
  const token = jwt[who];
  const transport = async (path: string, signal: AbortSignal) => {
    const res = await app.request(path, {
      method: "GET",
      signal,
      headers: { authorization: "Bearer " + token },
    });
    return {
      status: res.status,
      headers: { "cache-control": res.headers.get("cache-control") ?? "" },
      body: await res.json(),
    };
  };
  await act(async () =>
    root.render(
      createElement(TrainerExamSummaryRead20261022, {
        pathname: "/main-panel/exam-results",
        actor,
        token,
        authEpoch: "epoch",
        enabled: true,
        transport,
        getCurrentSession: () => (current ? { actor, token, authEpoch: "epoch" } : null),
      }),
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
describe("AG4 canonical exam list→filter→details ACTUAL Hono/Core synthetic Prisma", () => {
  it("trainer own summary, filter, selected details no PII", async () => {
    await mount();
    expect(host.textContent).toContain("Курс дня");
    expect(host.textContent).not.toContain("Course b-new");
    expect(host.textContent).toContain("отображено: 1");
    await act(async () => {
      (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });
    expect(host.textContent).toContain("отображено: 3");
    await act(async () => {
      const selects = host.querySelectorAll("select");
      const sort = selects[1] as HTMLSelectElement;
      sort.value = "course";
      sort.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    expect(host.querySelectorAll("li").length).toBe(3);
    await act(async () => {
      [...host.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Course a-old"))!
        .click();
    });
    expect(host.querySelector('[aria-label="Подробности экзамена"]')?.textContent).toContain(
      "Статус: Завершён",
    );
    expect(host.textContent).not.toContain(PRIVATE);
    expect(host.textContent).not.toContain("STUDENT-");
    expect(store.writes).not.toHaveBeenCalled();
  });
  it("admin elevated, moderator pending-only and retired session denied", async () => {
    await mount("ADMIN");
    expect(host.textContent).toContain("отображено: 2");
    await mount("MOD");
    // MODERATOR is allowed the pending-only READ, never the summary view.
    expect(host.querySelector('[data-exam-pending-readonly="true"]')).not.toBeNull();
    expect(host.querySelector('[data-exam-readonly="true"]')).toBeNull();
    expect(
      [...host.querySelectorAll('nav[aria-label="Разделы результатов экзаменов"] button')].map(
        (button) => button.textContent,
      ),
    ).toEqual(["Ожидают проверки"]);
    expect(host.textContent).not.toContain(PRIVATE);
    await mount("A", false);
    expect(host.textContent).toContain("Результаты экзаменов недоступны");
  });
  it("empty and private error masked", async () => {
    store.find.mockResolvedValue([]);
    await mount();
    expect(host.textContent).toContain("Результатов нет");
    await act(async () => root.unmount());
    root = createRoot(host);
    store.find.mockRejectedValueOnce(Error(PRIVATE));
    await mount();
    expect(host.textContent).toContain("Не удалось получить результаты экзаменов");
    expect(host.textContent).not.toContain(PRIVATE);
  });
});

// AG2-EXAM403 focused existing mounted file. Synthetic metadata responses only.
const AG2_CC = { "cache-control": "private, no-store" };
const ag2Summary = (title: string, id: string) => ({
  id,
  createdAt: "2026-10-23T10:00:00.000Z",
  courseName: title,
  stepTitle: "Итоговый шаг",
  status: "IN_PROGRESS",
  hasTestQuestions: true,
  requiresWrittenFeedback: false,
  requiresVideoReport: false,
});
const ag2Response = (status: number, rows: ReturnType<typeof ag2Summary>[] = []) => ({
  status,
  headers: AG2_CC,
  body: status === 200 ? { success: true, data: rows } : { success: false, code: "READ_DENIED" },
});
const ag2Tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function ag2Mount(
  transport: (path: string, signal: AbortSignal) => Promise<ReturnType<typeof ag2Response>>,
  principal: "A" | "ADMIN" = "A",
  epoch = "e1",
) {
  const a = actors[principal],
    actor = { id: a.id, role: a.role },
    token = jwt[principal];
  await act(async () =>
    root.render(
      createElement(TrainerExamSummaryRead20261022, {
        pathname: "/main-panel/exam-results",
        actor,
        token,
        authEpoch: epoch,
        enabled: true,
        transport,
        getCurrentSession: () => ({ actor, token, authEpoch: epoch }),
      }),
    ),
  );
  await ag2Tick();
}
const ag2Button = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);

describe("AG2-EXAM403 summary READ terminal error UX", () => {
  it("403 after selected success hides old details and cards; no retry; safe existing panel link", async () => {
    const first = vi.fn(async () => ag2Response(200, [ag2Summary("OLD_EXAM_PRIVATE", "old-exam")]));
    await ag2Mount(first);
    await act(async () => ag2Button("OLD_EXAM_PRIVATE — Итоговый шаг")?.click());
    expect(host.querySelector('[aria-label="Подробности экзамена"]')).not.toBeNull();
    const denied = vi.fn(async () => ag2Response(403));
    await ag2Mount(denied);
    expect(denied).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Нет доступа к результатам экзаменов");
    expect(host.textContent).not.toContain("OLD_EXAM_PRIVATE");
    expect(host.querySelector('[aria-label="Подробности экзамена"]')).toBeNull();
    expect(ag2Button("Повторить чтение")).toBeUndefined();
    expect(host.querySelector('a[href="/main-panel"]')?.textContent).toContain(
      "Назад в панель тренера",
    );
  });
  it("503 manual retry -> fresh 200 for current summary, no previous rows", async () => {
    let attempt = 0;
    const transport = vi.fn(async () =>
      ag2Response(++attempt === 1 ? 503 : 200, [ag2Summary("FRESH_SUMMARY_200", "fresh")]),
    );
    await ag2Mount(transport);
    expect(host.textContent).toContain("Не удалось получить результаты экзаменов");
    expect(host.textContent).not.toContain("FRESH_SUMMARY_200");
    await act(async () => ag2Button("Повторить чтение")?.click());
    await ag2Tick();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("FRESH_SUMMARY_200");
  });
  it("401 preserves existing generic error and manual retry", async () => {
    await ag2Mount(async () => ag2Response(401));
    expect(host.textContent).toContain("Не удалось получить результаты экзаменов");
    expect(ag2Button("Повторить чтение")).toBeDefined();
  });
});
