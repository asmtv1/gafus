/**
 * AG1 cont138 targeted source proof only, independent of peer-owned
 * route/app files: signed JWT -> REGISTERED Hono -> ACTUAL unmocked
 * Core getPendingExamResults -> synthetic Prisma examResult.findMany.
 * NO Core mock, real SQL/browser/socket/provider/notes/review/writes.
 */
import { randomBytes } from "node:crypto";
import { act, createElement } from "react";
import { TrainerExamSummaryRead20261022 } from "./TrainerExamSummaryRead20261022";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
const store = vi.hoisted(() => ({
  find: vi.fn(),
  user: vi.fn(),
  registration: vi.fn(),
  write: vi.fn(),
  rateKeys: [] as string[],
  limited: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60000;
    init(v: { windowMs: number }) {
      this.windowMs = v.windowMs;
    }
    async increment(key: string) {
      store.rateKeys.push(key);
      return {
        totalHits: store.limited ? 101 : 1,
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
      examResult: {
        ...actual.prisma.examResult,
        findMany: store.find,
        create: store.write,
        update: store.write,
        delete: store.write,
      },
      user: { ...actual.prisma.user, findUnique: store.user },
      $transaction: store.write,
    },
  };
});
vi.mock("@gafus/core/services/auth", async (original) => ({
  ...(await original<object>()),
  isRegistrationCompleted: store.registration,
}));
// No @gafus/core/services/exam mock.
const { app } = await vi.importActual<{
  app: { request: (path: string, init?: RequestInit) => Promise<Response> };
}>("../../../api/src/app");
const { generateAccessToken } = await vi.importActual<{
  generateAccessToken: (a: { id: string; username: string; role: string }) => Promise<string>;
}>("@gafus/auth/jwt");

const SECRET = "PRIVATE_STUDENT_EMAIL_AND_WRITTEN_FEEDBACK_VIDEO_TEST_ANSWERS";
const actors = {
  A: { id: "pending-trainer-A", username: "trainer-a", role: "TRAINER" },
  B: { id: "pending-trainer-B", username: "trainer-b", role: "TRAINER" },
  MOD: { id: "pending-moderator", username: "moderator", role: "MODERATOR" },
  ADMIN: { id: "pending-admin", username: "admin", role: "ADMIN" },
  USER: { id: "pending-user", username: "user", role: "USER" },
  PARTNER: { id: "pending-partner", username: "partner", role: "PARTNER" },
} as const;
const jwt: Record<string, string> = {};
type Source = {
  id: string;
  createdAt: Date;
  testAnswers: unknown;
  testScore: number;
  testMaxScore: number;
  videoReportUrl: string;
  writtenFeedback: string;
  userStep: {
    id: string;
    status: "IN_PROGRESS" | "COMPLETED";
    userTraining: {
      user: { username: string };
      dayOnCourse: { course: { name: string; authorId: string }; day: { title: string } };
    };
    stepOnDay: {
      step: {
        title: string;
        hasTestQuestions: boolean;
        requiresWrittenFeedback: boolean;
        requiresVideoReport: boolean;
        checklist: string;
      };
    };
  } | null;
};
const item = (
  key: string,
  authorId: string,
  stamp: string,
  flags: [boolean, boolean, boolean],
  status: "IN_PROGRESS" | "COMPLETED" = "IN_PROGRESS",
): Source => ({
  id: key,
  createdAt: new Date(stamp),
  testAnswers: { private: SECRET },
  testScore: 8,
  testMaxScore: 10,
  videoReportUrl: SECRET,
  writtenFeedback: SECRET,
  userStep: {
    id: "userstep-" + key,
    status,
    userTraining: {
      user: { username: SECRET },
      dayOnCourse: { course: { name: "Course " + key, authorId }, day: { title: "Day " + key } },
    },
    stepOnDay: {
      step: {
        title: "Step " + key,
        hasTestQuestions: flags[0],
        requiresWrittenFeedback: flags[1],
        requiresVideoReport: flags[2],
        checklist: SECRET,
      },
    },
  },
});
const fixtures: Source[] = [
  item("a-written", actors.A.id, "2026-10-21T15:00:00Z", [true, true, false]),
  item("b-video", actors.B.id, "2026-10-22T08:00:00Z", [false, false, true]),
  item("mod-own", actors.MOD.id, "2026-10-19T09:00:00Z", [false, true, true]),
  item("a-test-only", actors.A.id, "2026-10-23T09:00:00Z", [true, false, false]),
  item("a-completed", actors.A.id, "2026-10-24T09:00:00Z", [true, true, false], "COMPLETED"),
  item("a-tie", actors.A.id, "2026-10-21T15:00:00Z", [false, true, false]),
];
type Query = {
  where: {
    userStep: {
      status: string;
      stepOnDay: { step: { NOT: Record<string, boolean> } };
      userTraining: { dayOnCourse: { course: { authorId?: string } } };
    };
  };
  orderBy: { createdAt: string };
  include: unknown;
};
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [key, actor] of Object.entries(actors)) jwt[key] = await generateAccessToken(actor);
});
beforeEach(() => {
  vi.clearAllMocks();
  store.limited = false;
  store.rateKeys.length = 0;
  store.registration.mockResolvedValue(true);
  store.user.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role } : null;
  });
  store.find.mockImplementation(async (q: Query) => {
    if (!("userStep" in q.where) || !q.where.userStep || !("stepOnDay" in q.where.userStep))
      return [];
    const owner = q.where.userStep.userTraining.dayOnCourse.course.authorId;
    return fixtures
      .filter((f) => {
        if (f.userStep?.status !== "IN_PROGRESS") return false;
        const step = f.userStep.stepOnDay.step;
        if (step.hasTestQuestions && !step.requiresVideoReport && !step.requiresWrittenFeedback)
          return false;
        return !owner || f.userStep.userTraining.dayOnCourse.course.authorId === owner;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });
});

const { JSDOM } = await vi.importActual<{
  JSDOM: new (h: string, o: { url: string }) => { window: Window & typeof globalThis };
}>("jsdom");
const dom = new JSDOM("<html><body></body></html>", { url: "http://localhost" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { createRoot } = await import("react-dom/client");
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function mount(who: "A" | "ADMIN" | "MOD" = "A", live = true) {
  const a = actors[who],
    actor = { id: a.id, role: a.role },
    token = jwt[who];
  const transport = async (path: string, signal: AbortSignal) => {
    const r = await app.request(path, {
      method: "GET",
      signal,
      headers: { authorization: "Bearer " + token },
    });
    return {
      status: r.status,
      headers: { "cache-control": r.headers.get("cache-control") ?? "" },
      body: await r.json(),
    };
  };
  await act(async () =>
    root.render(
      createElement(TrainerExamSummaryRead20261022, {
        pathname: "/main-panel/exam-results",
        actor,
        token,
        authEpoch: "e",
        enabled: true,
        transport,
        getCurrentSession: () => (live ? { actor, token, authEpoch: "e" } : null),
      }),
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
async function pendingClick() {
  await act(async () =>
    [...host.querySelectorAll("button")].find((x) => x.textContent === "Ожидают проверки")!.click(),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
describe("AG4 existing summary ↔ pending actual Hono and Core", () => {
  it("TRAINER summary then pending own regular-only, no PII; return summary", async () => {
    await mount();
    expect(host.textContent).toContain("Результатов нет");
    await pendingClick();
    expect(host.textContent).toContain("Course a-written");
    expect(host.textContent).not.toContain("Course b-video");
    expect(host.textContent).not.toContain(SECRET);
    expect(host.textContent).not.toContain("a-test-only");
    await act(async () =>
      [...host.querySelectorAll("button")].find((x) => x.textContent === "Все результаты")!.click(),
    );
    expect(host.textContent).toContain("Результатов нет");
    expect(store.write).not.toHaveBeenCalled();
  });
  it("ADMIN mixed; MOD own pending; session retirement", async () => {
    await mount("ADMIN");
    await pendingClick();
    expect(host.textContent).toContain("Course b-video");
    expect(host.textContent).toContain("Course mod-own");
    await mount("MOD");
    expect(host.textContent).toContain("Course mod-own");
    expect(host.textContent).not.toContain("Course a-written");
    await mount("A", false);
    expect(host.textContent).toContain("недоступны");
  });
  it("empty and private error masking", async () => {
    store.find.mockResolvedValue([]);
    await mount();
    await pendingClick();
    expect(host.textContent).toContain("Ожидающих экзаменов нет");
    await act(async () => root.unmount());
    root = createRoot(host);
    store.find.mockRejectedValueOnce(Error(SECRET));
    await mount("MOD");
    expect(host.textContent).toContain("Не удалось получить ожидающие экзамены");
    expect(host.textContent).not.toContain(SECRET);
  });
});

// AG2-EXAM403 scoped synthetic mounted cases; no new test framework or endpoint.
const ag2PendingRow = (name: string, id: string) => ({
  id,
  stepTitle: "Шаг",
  courseName: name,
  dayTitle: "День",
  hasTestQuestions: true,
  hasWrittenFeedback: true,
  hasVideoReport: false,
  submittedAt: "2026-10-23T10:00:00.000Z",
});
const ag2PendingResponse = (status: number, rows: ReturnType<typeof ag2PendingRow>[] = []) => ({
  status,
  headers: { "cache-control": "private, no-store" },
  body:
    status === 200
      ? { success: true, data: rows }
      : { success: false, code: "DENIED_OR_TEMPORARY" },
});
const ag2PendingTick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function ag2PendingMount(
  who: "A" | "B" | "MOD",
  transport: (path: string, signal: AbortSignal) => Promise<{
    status: number;
    headers: Record<string, string>;
    body: unknown;
  }>,
  epoch = "one",
  live?: () => {
    actor: { id: string; role: "TRAINER" | "MODERATOR" };
    token: string;
    authEpoch: string;
  } | null,
) {
  const a = actors[who];
  const actor = { id: a.id, role: a.role },
    token = jwt[who];
  await act(async () =>
    root.render(
      createElement(TrainerExamSummaryRead20261022, {
        pathname: "/main-panel/exam-results",
        actor,
        token,
        authEpoch: epoch,
        enabled: true,
        transport,
        getCurrentSession: live ?? (() => ({ actor, token, authEpoch: epoch })),
      }),
    ),
  );
  await ag2PendingTick();
}
const ag2PendingBtn = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);

describe("AG2-EXAM403 pending READ terminal error UX", () => {
  it("MODERATOR pending-only 403 after 200, old rows hidden, no retry, no summary GET", async () => {
    const paths: string[] = [];
    const first = async (path: string) => {
      paths.push(path);
      return ag2PendingResponse(200, [ag2PendingRow("OLD_PENDING_PRIVATE", "old-pending")]);
    };
    await ag2PendingMount("MOD", first);
    expect(host.textContent).toContain("OLD_PENDING_PRIVATE");
    const denied = vi.fn(async (path: string) => {
      paths.push(path);
      return ag2PendingResponse(403);
    });
    await ag2PendingMount("MOD", denied, "two");
    expect(host.textContent).toContain("Нет доступа к ожидающим экзаменам");
    expect(host.textContent).not.toContain("OLD_PENDING_PRIVATE");
    expect(host.textContent).not.toContain("Повторить чтение");
    expect(host.querySelector('a[href="/main-panel"]')).not.toBeNull();
    expect(paths.every((path) => path === "/api/v1/trainer/exam-results/pending-summary")).toBe(
      true,
    );
    expect(denied).toHaveBeenCalledTimes(1);
  });
  it("503 manual retry on pending -> fresh 200, preserve summary independence", async () => {
    const paths: string[] = [];
    let pendingCount = 0;
    const transport = vi.fn(async (path: string) => {
      paths.push(path);
      if (path.endsWith("/summary") && !path.endsWith("/pending-summary"))
        return ag2PendingResponse(403);
      pendingCount++;
      return ag2PendingResponse(pendingCount === 1 ? 503 : 200, [
        ag2PendingRow("FRESH_PENDING_200", "fresh-pending"),
      ]);
    });
    await ag2PendingMount("A", transport);
    await act(async () => ag2PendingBtn("Ожидают проверки")?.click());
    await ag2PendingTick();
    expect(host.textContent).toContain("Не удалось получить ожидающие экзамены");
    expect(host.textContent).not.toContain("FRESH_PENDING_200");
    expect(ag2PendingBtn("Повторить чтение")).toBeDefined();
    await act(async () => ag2PendingBtn("Повторить чтение")?.click());
    await ag2PendingTick();
    expect(host.textContent).toContain("FRESH_PENDING_200");
    expect(pendingCount).toBe(2);
    await act(async () => ag2PendingBtn("Все результаты")?.click());
    await ag2PendingTick();
    expect(host.textContent).toContain("Нет доступа к результатам экзаменов");
    expect(host.textContent).not.toContain("FRESH_PENDING_200");
  });
  it("pending 401 keeps generic error with manual retry", async () => {
    await ag2PendingMount("MOD", async () => ag2PendingResponse(401));
    expect(host.textContent).toContain("Не удалось получить ожидающие экзамены");
    expect(ag2PendingBtn("Повторить чтение")).toBeDefined();
  });
  it("late old trainer pending success does not resurrect rows after new MOD 403", async () => {
    let resolveOld!: (result: ReturnType<typeof ag2PendingResponse>) => void;
    const old = new Promise<ReturnType<typeof ag2PendingResponse>>((resolve) => {
      resolveOld = resolve;
    });
    const oldTransport = async (path: string) =>
      path.endsWith("/pending-summary") ? old : ag2PendingResponse(200);
    await ag2PendingMount("A", oldTransport);
    await act(async () => ag2PendingBtn("Ожидают проверки")?.click());
    await ag2PendingTick();
    await ag2PendingMount("MOD", async () => ag2PendingResponse(403), "new-epoch");
    expect(host.textContent).toContain("Нет доступа к ожидающим экзаменам");
    await act(async () =>
      resolveOld(ag2PendingResponse(200, [ag2PendingRow("LATE_PRIVATE_A", "late")])),
    );
    await ag2PendingTick();
    expect(host.textContent).not.toContain("LATE_PRIVATE_A");
    expect(host.textContent).not.toContain("Повторить чтение");
  });
});


// Scoped current-source regression: injected READ transport, never real HTTP/SQL.
describe("AG2_EXAM_INDEPENDENT_READ_RECOVERY mounted-local", () => {
  const SUMMARY = "/api/v1/trainer/exam-results/summary";
  const PENDING = "/api/v1/trainer/exam-results/pending-summary";
  const examSummary = (id: string) => ({
    id, createdAt: "2026-10-24T09:00:00.000Z", courseName: `Экзамен ${id}`,
    stepTitle: "Проверка", status: "IN_PROGRESS", hasTestQuestions: true,
    requiresWrittenFeedback: false, requiresVideoReport: false,
  });
  const response = (status: number, rows: unknown[] = []) => ({
    status, headers: { "cache-control": "private, no-store" },
    body: status === 200 ? { success: true, data: rows } : { success: false, code: "FAILED" },
  });
  type ResponseShape = ReturnType<typeof response>;
  const defer = () => {
    let resolve!: (value: ResponseShape) => void;
    const promise = new Promise<ResponseShape>(r => { resolve = r; });
    return { resolve, promise };
  };
  const switchTo = async (label: string) => {
    await act(async () => ag2PendingBtn(label)?.click());
    await ag2PendingTick();
  };
  it("pending-only manual retry keeps previously confirmed summary, GETs only pending, no false empty", async () => {
    const calls: string[] = [];
    const waiting = defer(); let pendingCount = 0;
    const transport = vi.fn(async (path: string, _signal: AbortSignal) => {
      calls.push(path);
      if (path === SUMMARY) return response(200, [examSummary("READY_SUMMARY")]);
      if (path === PENDING) return ++pendingCount === 1 ? response(503) : waiting.promise;
      throw Error("unexpected path");
    });
    await ag2PendingMount("A", transport);
    expect(host.textContent).toContain("Экзамен READY_SUMMARY");
    await act(async () => ag2PendingBtn("Экзамен READY_SUMMARY — Проверка")?.click());
    expect(host.querySelector('[aria-label="Подробности экзамена"]')).not.toBeNull();
    await switchTo("Ожидают проверки");
    expect(host.textContent).toContain("Не удалось получить ожидающие экзамены");
    expect(host.textContent).not.toContain("Ожидающих экзаменов нет");
    const retry = ag2PendingBtn("Повторить чтение")!;
    await act(async () => { retry.click(); retry.click(); });
    expect(host.textContent).toContain("Загрузка ожидающих экзаменов");
    expect(host.textContent).not.toContain("Ожидающих экзаменов нет");
    expect(ag2PendingBtn("Повторить чтение")).toBeUndefined();
    expect(calls).toEqual([SUMMARY, PENDING, PENDING]);
    await act(async () => waiting.resolve(response(200,[ag2PendingRow("PENDING_OK", "p1")])));
    await ag2PendingTick();
    expect(host.textContent).toContain("PENDING_OK");
    await switchTo("Все результаты");
    expect(host.textContent).toContain("Экзамен READY_SUMMARY");
    expect(host.querySelector('[aria-label="Подробности экзамена"]')).not.toBeNull();
    expect(calls).toEqual([SUMMARY, PENDING, PENDING]);
    expect(store.write).not.toHaveBeenCalled();
  });
  it("summary-only retry does not re-request previously successful pending; tabs keep existing semantics", async () => {
    const calls: string[] = []; let summaryCount = 0;
    const transport = vi.fn(async (path: string, _signal: AbortSignal) => {
      calls.push(path);
      if(path === SUMMARY) return ++summaryCount === 1 ? response(503) : response(200,[examSummary("NEW_SUMMARY")]);
      if(path === PENDING) return response(200,[ag2PendingRow("PENDING_CONFIRMED", "p2")]);
      throw Error("unexpected path");
    });
    await ag2PendingMount("A",transport);
    expect(host.textContent).toContain("Не удалось получить результаты экзаменов");
    await switchTo("Ожидают проверки");
    expect(host.textContent).toContain("PENDING_CONFIRMED");
    await switchTo("Все результаты");
    expect(host.textContent).toContain("Не удалось получить результаты экзаменов");
    await act(async () => ag2PendingBtn("Повторить чтение")?.click());
    await ag2PendingTick();
    expect(host.textContent).toContain("Экзамен NEW_SUMMARY");
    expect(calls).toEqual([SUMMARY,PENDING,SUMMARY]);
    // A later tab change still performs its original pending GET; no new cache policy.
    await switchTo("Ожидают проверки");
    expect(host.textContent).toContain("PENDING_CONFIRMED");
    expect(calls).toEqual([SUMMARY,PENDING,SUMMARY,PENDING]);
    expect(store.write).not.toHaveBeenCalled();
  });
  it("pending retry late ACK from retired actor/epoch is ignored after new MOD 403", async () => {
    const calls: string[] = []; const waiting = defer(); let pendingCount = 0;
    const old = vi.fn(async (path: string, _signal: AbortSignal) => {
      calls.push(path);
      if(path === SUMMARY) return response(200,[examSummary("OLD_SUMMARY")]);
      return ++pendingCount === 1 ? response(503) : waiting.promise;
    });
    await ag2PendingMount("A",old);
    await switchTo("Ожидают проверки");
    expect(host.textContent).toContain("Не удалось получить ожидающие экзамены");
    await act(async () => ag2PendingBtn("Повторить чтение")?.click());
    expect(host.textContent).toContain("Загрузка ожидающих экзаменов");
    const mod = vi.fn(async (path: string, _signal: AbortSignal) => {
      calls.push(path);
      return response(403);
    });
    await ag2PendingMount("MOD",mod,"new-epoch");
    expect(host.textContent).toContain("Нет доступа к ожидающим экзаменам");
    expect(ag2PendingBtn("Повторить чтение")).toBeUndefined();
    expect(calls).toEqual([SUMMARY,PENDING,PENDING,PENDING]);
    await act(async () => waiting.resolve(response(200,[ag2PendingRow("PRIVATE_OLD_RETRY", "old")])));
    await ag2PendingTick();
    expect(host.textContent).not.toContain("PRIVATE_OLD_RETRY");
    expect(host.textContent).not.toContain("OLD_SUMMARY");
    expect(host.textContent).toContain("Нет доступа к ожидающим экзаменам");
    expect(mod).toHaveBeenCalledOnce();
    expect(store.write).not.toHaveBeenCalled();
  });
  it("MODERATOR terminal 403 stays pending only, without summary or retry", async () => {
    const calls: string[]=[];
    await ag2PendingMount("MOD",async(path:string)=>{
      calls.push(path);
      return response(403);
    });
    expect(calls).toEqual([PENDING]);
    expect(host.textContent).toContain("Нет доступа к ожидающим экзаменам");
    expect(host.textContent).not.toContain("Ожидающих экзаменов нет");
    expect(ag2PendingBtn("Повторить чтение")).toBeUndefined();
    expect(ag2PendingBtn("Все результаты")).toBeUndefined();
    expect(store.write).not.toHaveBeenCalled();
  });
});


// Scoped Exam READ filter-only interaction; exact existing injected GET contract, no Hono/SQL.
describe("AG2_EXAM_SUMMARY_FILTER_RECOVERY mounted-local", () => {
  const SUMMARY = "/api/v1/trainer/exam-results/summary";
  const PENDING = "/api/v1/trainer/exam-results/pending-summary";
  const row = (id: string, status: "IN_PROGRESS" | "COMPLETED", courseName: string,
    flags: { test?: boolean; written?: boolean; video?: boolean } = {}) => ({
    id, status, courseName, stepTitle: `Шаг ${id}`,
    createdAt: `2026-10-${id === "z" ? "24" : "23"}T09:00:00.000Z`,
    hasTestQuestions: flags.test ?? false,
    requiresWrittenFeedback: flags.written ?? false,
    requiresVideoReport: flags.video ?? false,
  });
  const response = (status: number, rows: unknown[] = []) => ({
    status, headers: { "cache-control": "private, no-store" },
    body: status === 200 ? { success: true, data: rows } : { success: false, code: "DENIED" },
  });
  const detail = () => host.querySelector<HTMLElement>('[aria-label="Подробности экзамена"]');
  const button = (title: string) => ag2PendingBtn(title);
  const inputs = () => host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  const selects = () => host.querySelectorAll<HTMLSelectElement>("select");
  async function setSelect(index: number, value: string) {
    await act(async () => {
      const select = selects()[index]!;
      select.value = value;
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  }
  async function showAll() {
    await act(async () => button("Показать все результаты")?.click());
  }
  it("actual confirmed empty GET remains genuine empty, with no filter recovery or extra GET", async () => {
    const calls: string[] = [];
    const transport = vi.fn(async (path: string) => {
      calls.push(path);
      return response(200, []);
    });
    await ag2PendingMount("A", transport);
    expect(host.textContent).toContain("Результатов нет");
    expect(host.textContent).not.toContain("Нет результатов по выбранным фильтрам");
    expect(button("Показать все результаты")).toBeUndefined();
    expect(detail()).toBeNull();
    expect(calls).toEqual([SUMMARY]);
    expect(store.write).not.toHaveBeenCalled();
  });
  it("default hide completed yields a filter explanation; show all restores rows without GET and keeps course sorting", async () => {
    const calls: string[] = [];
    const transport = vi.fn(async (path: string) => {
      calls.push(path);
      return response(200, [
        row("z", "COMPLETED", "Z-класс", { test: true }),
        row("a", "COMPLETED", "A-класс", { written: true }),
      ]);
    });
    await ag2PendingMount("A", transport);
    expect(inputs()[0]?.checked).toBe(true);
    expect(host.textContent).toContain("Нет результатов по выбранным фильтрам");
    expect(host.textContent).not.toContain("Результатов нет");
    expect(button("Показать все результаты")).toBeDefined();
    expect(detail()).toBeNull();
    await setSelect(1, "course");
    expect(selects()[1]?.value).toBe("course");
    await showAll();
    expect(inputs()[0]?.checked).toBe(false);
    expect(selects()[0]?.value).toBe("all");
    expect(selects()[1]?.value).toBe("course");
    const titles = [...host.querySelectorAll<HTMLLIElement>("li")].map(x => x.textContent);
    expect(titles[0]).toContain("A-класс");
    expect(titles[1]).toContain("Z-класс");
    expect(button("Показать все результаты")).toBeUndefined();
    expect(calls).toEqual([SUMMARY]);
    expect(store.write).not.toHaveBeenCalled();
  });
  it("kind nonmatch hides selected details; show all restores matching ready list with no refetch", async () => {
    const calls: string[] = [];
    const transport = vi.fn(async (path: string) => {
      calls.push(path);
      return response(200, [row("q", "IN_PROGRESS", "Курс с тестом", { test: true })]);
    });
    await ag2PendingMount("A", transport);
    await act(async () => button("Курс с тестом — Шаг q")?.click());
    expect(detail()?.textContent).toContain("Курс с тестом");
    await setSelect(0, "video");
    expect(host.textContent).toContain("Нет результатов по выбранным фильтрам");
    expect(host.textContent).not.toContain("Результатов нет");
    expect(detail()).toBeNull();
    await showAll();
    expect(selects()[0]?.value).toBe("all");
    expect(inputs()[0]?.checked).toBe(false);
    expect(host.textContent).toContain("Курс с тестом");
    expect(host.textContent).not.toContain("Нет результатов по выбранным фильтрам");
    expect(calls).toEqual([SUMMARY]);
  });
  it("hide completed after selecting completed row hides detail; pending tab keeps independent fetch semantics", async () => {
    const calls: string[] = [];
    const transport = vi.fn(async (path: string) => {
      calls.push(path);
      return path === SUMMARY
        ? response(200, [row("z", "COMPLETED", "Закрытый экзамен", { video: true })])
        : response(200, [ag2PendingRow("Список ожидающих", "pending-x")]);
    });
    await ag2PendingMount("A", transport);
    await showAll();
    await act(async () => button("Закрытый экзамен — Шаг z")?.click());
    expect(detail()?.textContent).toContain("Закрытый экзамен");
    await act(async () => inputs()[0]?.click());
    expect(inputs()[0]?.checked).toBe(true);
    expect(detail()).toBeNull();
    expect(host.textContent).toContain("Нет результатов по выбранным фильтрам");
    await act(async () => button("Ожидают проверки")?.click());
    await ag2PendingTick();
    expect(host.textContent).toContain("Список ожидающих");
    expect(host.textContent).not.toContain("Нет результатов по выбранным фильтрам");
    expect(detail()).toBeNull();
    await act(async () => button("Все результаты")?.click());
    expect(host.textContent).toContain("Нет результатов по выбранным фильтрам");
    expect(detail()).toBeNull();
    expect(calls).toEqual([SUMMARY, PENDING]);
    expect(store.write).not.toHaveBeenCalled();
  });
  it("retired actor/epoch discards late summary ACK and cannot show old filtered details", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    const waiting = new Promise<ReturnType<typeof response>>(resolve => { finish = resolve; });
    const calls: string[] = [];
    const oldTransport = vi.fn(async (path: string) => {
      calls.push(path);
      return waiting;
    });
    await ag2PendingMount("A", oldTransport);
    expect(host.textContent).toContain("Загрузка результатов экзаменов");
    const newTransport = vi.fn(async (path: string) => {
      calls.push(path);
      return response(403);
    });
    await ag2PendingMount("B", newTransport, "epoch-B");
    expect(host.textContent).toContain("Нет доступа к результатам экзаменов");
    expect(detail()).toBeNull();
    expect(button("Показать все результаты")).toBeUndefined();
    await act(async () => finish(response(200,[row("old", "IN_PROGRESS", "PRIVATE_OLD_ACTOR")])));
    await ag2PendingTick();
    expect(host.textContent).not.toContain("PRIVATE_OLD_ACTOR");
    expect(host.textContent).toContain("Нет доступа к результатам экзаменов");
    expect(calls).toEqual([SUMMARY,SUMMARY]);
    expect(store.write).not.toHaveBeenCalled();
  });
});
