/**
 * AG1 cont139: registered Hono -> actual Notes minimal SQL producer ->
 * synthetic Prisma transaction snapshot, with signed JWT. No Core old
 * getTrainerNotes mock or old content SELECT, no real SQL/Redis/socket.
 */
import { randomBytes } from "node:crypto";
import { act, createElement } from "react";
import { TrainerNotesRead20261022 } from "./TrainerNotesRead20261022";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
const state = vi.hoisted(() => ({
  user: vi.fn(),
  registration: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  transaction: vi.fn(),
  write: vi.fn(),
  rateKeys: [] as string[],
  limited: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60000;
    init(o: { windowMs: number }) {
      this.windowMs = o.windowMs;
    }
    async increment(key: string) {
      state.rateKeys.push(key);
      return {
        totalHits: state.limited ? 101 : 1,
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
      user: { ...actual.prisma.user, findUnique: state.user },
      trainerNote: {
        ...actual.prisma.trainerNote,
        findMany: vi.fn(() => {
          throw Error("DIRECT_NOTES_READ_FORBIDDEN");
        }),
        count: vi.fn(() => {
          throw Error("DIRECT_NOTES_COUNT_FORBIDDEN");
        }),
        create: state.write,
        update: state.write,
        delete: state.write,
      },
      trainerNoteEntry: {
        ...actual.prisma.trainerNoteEntry,
        findMany: vi.fn(() => {
          throw Error("PRIVATE_ENTRY_READ_FORBIDDEN");
        }),
        create: state.write,
        update: state.write,
      },
      trainerNoteStudent: {
        ...actual.prisma.trainerNoteStudent,
        findMany: vi.fn(() => {
          throw Error("PRIVATE_STUDENT_READ_FORBIDDEN");
        }),
        create: state.write,
        delete: state.write,
      },
      $transaction: state.transaction,
    },
  };
});
vi.mock("@gafus/core/services/auth", async (original) => ({
  ...(await original<object>()),
  isRegistrationCompleted: state.registration,
}));
// No mock of the registered route / actual notes minimal read implementation.
const { app } = await vi.importActual<{
  app: { request: (path: string, init?: RequestInit) => Promise<Response> };
}>("../../../api/src/app");
const { generateAccessToken } = await vi.importActual<{
  generateAccessToken: (a: { id: string; username: string; role: string }) => Promise<string>;
}>("@gafus/auth/jwt");

const PRIVATE = "CONFIDENTIAL_STUDENT_USER_EMAIL_ENTRY_CONTENT";
const actors = {
  A: { id: "notes-actor-A", username: "trainerA", role: "TRAINER" },
  B: { id: "notes-actor-B", username: "trainerB", role: "TRAINER" },
  MOD: { id: "notes-actor-MOD", username: "moderator", role: "MODERATOR" },
  ADMIN: { id: "notes-actor-ADMIN", username: "admin", role: "ADMIN" },
  USER: { id: "notes-actor-USER", username: "user", role: "USER" },
  PARTNER: { id: "notes-actor-PARTNER", username: "partner", role: "PARTNER" },
} as const;
const jwt: Record<string, string> = {};
type DbNote = {
  id: string;
  trainerId: string;
  title: string | null;
  tags: string[];
  createdAt: Date;
  entries: { content: string }[];
  students: { studentId: string }[];
  privateNote: string;
};
const dbNotes: DbNote[] = [
  {
    id: "note-a1",
    trainerId: actors.A.id,
    title: "A first",
    tags: ["focus", "dog"],
    createdAt: new Date("2026-10-22T10:00:00Z"),
    entries: [{ content: PRIVATE }],
    students: [{ studentId: PRIVATE }],
    privateNote: PRIVATE,
  },
  {
    id: "note-a2",
    trainerId: actors.A.id,
    title: null,
    tags: [],
    createdAt: new Date("2026-10-21T11:00:00Z"),
    entries: [{ content: PRIVATE }],
    students: [{ studentId: PRIVATE }],
    privateNote: PRIVATE,
  },
  {
    id: "note-b1",
    trainerId: actors.B.id,
    title: "B's note",
    tags: ["kennel"],
    createdAt: new Date("2026-10-20T11:00:00Z"),
    entries: [{ content: PRIVATE }],
    students: [{ studentId: PRIVATE }],
    privateNote: PRIVATE,
  },
  {
    id: "note-mod",
    trainerId: actors.MOD.id,
    title: "Mod note",
    tags: ["week"],
    createdAt: new Date("2026-10-19T11:00:00Z"),
    entries: [{ content: PRIVATE }],
    students: [{ studentId: PRIVATE }],
    privateNote: PRIVATE,
  },
];
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [label, actor] of Object.entries(actors))
    jwt[label] = await generateAccessToken(actor);
});
beforeEach(() => {
  vi.clearAllMocks();
  state.limited = false;
  state.rateKeys.length = 0;
  state.user.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role } : null;
  });
  state.registration.mockResolvedValue(true);
  state.transaction.mockImplementation(async (callback: (t: unknown) => Promise<unknown>) => {
    // One logical snapshot for BOTH list and count.
    const snapshot = dbNotes.map((row) => ({ ...row }));
    const tx = {
      trainerNote: {
        findMany: (args: { where: { trainerId?: string }; skip: number; take: number }) => {
          state.find(args);
          return Promise.resolve(
            snapshot
              .filter((x) => !args.where.trainerId || x.trainerId === args.where.trainerId)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(args.skip, args.skip + args.take),
          );
        },
        count: (args: { where: { trainerId?: string } }) => {
          state.count(args);
          return Promise.resolve(
            snapshot.filter((x) => !args.where.trainerId || x.trainerId === args.where.trainerId)
              .length,
          );
        },
      },
    };
    return callback(tx);
  });
});
const { JSDOM } = await vi.importActual<{
  JSDOM: new (html: string, opts: { url: string }) => { window: Window & typeof globalThis };
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
async function mount(who: "A" | "B" | "MOD" | "ADMIN" = "A", live = true) {
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
      createElement(TrainerNotesRead20261022, {
        pathname: "/main-panel/notes",
        actor,
        token,
        authEpoch: "e",
        enabled: true,
        pageSize: 2,
        transport,
        getCurrentSession: () => (live ? { actor, token, authEpoch: "e" } : null),
      }),
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
async function nav(label: string) {
  await act(async () =>
    [...host.querySelectorAll("button")].find((x) => x.textContent === label)!.click(),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
describe("AG4 canonical Notes read UI → registered Hono → actual minimal Prisma service", () => {
  it("ADMIN all, next/back pages, secure four fields only", async () => {
    await mount("ADMIN");
    expect(host.textContent).toContain("Всего заметок: 4");
    expect(host.textContent).toContain("A first");
    await nav("Следующая страница");
    expect(host.textContent).toContain("Страница 2");
    expect(host.textContent).toContain("B's note");
    await nav("Предыдущая страница");
    expect(host.textContent).toContain("Страница 1");
    expect(host.textContent).toContain("A first");
    expect(host.textContent).not.toContain(PRIVATE);
    expect(state.transaction).toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
  });
  it("TRAINER own and MOD own; session retired", async () => {
    await mount("A");
    expect(host.textContent).toContain("A first");
    expect(host.textContent).not.toContain("B's note");
    await mount("MOD");
    expect(host.textContent).toContain("Mod note");
    await mount("A", false);
    expect(host.textContent).toContain("недоступны");
  });
  it("empty and masked private DB error", async () => {
    await mount("B");
    expect(host.textContent).toContain("B's note");
    await act(async () => root.unmount());
    root = createRoot(host);
    state.transaction.mockRejectedValueOnce(Error(PRIVATE));
    await mount("A");
    expect(host.textContent).toContain("Не удалось загрузить заметки");
    expect(host.textContent).not.toContain(PRIVATE);
  });
});

// AG2 Notes metadata READ terminal-403 UX: use only the existing mounted React and transport seam.
const notesUxRow = (name: string, id: string) => ({
  id,
  title: name,
  tags: ["metadata"],
  createdAt: "2026-10-23T10:00:00.000Z",
});
const notesUxResponse = (status: number, notes: ReturnType<typeof notesUxRow>[] = []) => ({
  status,
  headers: { "cache-control": "private, no-store" },
  body:
    status === 200
      ? { success: true, data: { notes, total: notes.length, page: 0, pageSize: 2 } }
      : { success: false, code: "READ_DENIED" },
});
const notesUxTick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function notesUxMount(
  who: "A" | "B",
  transport: (path: string, signal: AbortSignal) => Promise<ReturnType<typeof notesUxResponse>>,
  epoch = "notes-e",
  currentOverride?: () => {
    actor: { id: string; role: "TRAINER" };
    token: string;
    authEpoch: string;
  } | null,
) {
  const a = actors[who],
    actor = { id: a.id, role: a.role },
    token = jwt[who];
  await act(async () =>
    root.render(
      createElement(TrainerNotesRead20261022, {
        pathname: "/main-panel/notes",
        actor,
        token,
        authEpoch: epoch,
        pageSize: 2,
        enabled: true,
        transport,
        getCurrentSession: currentOverride ?? (() => ({ actor, token, authEpoch: epoch })),
      }),
    ),
  );
  await notesUxTick();
}
const notesUxRetry = () =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === "Повторить чтение",
  );
describe("AG2-NOTES-403 scoped metadata READ presentation", () => {
  it("403 after successful metadata hides old title/count and disables retry; panel link", async () => {
    const ready = vi.fn(async () =>
      notesUxResponse(200, [notesUxRow("OLD_NOTES_TITLE", "old-note")]),
    );
    await notesUxMount("A", ready);
    expect(host.textContent).toContain("OLD_NOTES_TITLE");
    expect(host.textContent).toContain("Всего заметок: 1");
    const denied = vi.fn(async () => notesUxResponse(403));
    await notesUxMount("A", denied);
    expect(denied).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Нет доступа к заметкам");
    expect(host.textContent).not.toContain("OLD_NOTES_TITLE");
    expect(host.textContent).not.toContain("Всего заметок");
    expect(notesUxRetry()).toBeUndefined();
    expect(host.querySelector('a[href="/main-panel"]')?.textContent).toContain(
      "Назад в панель тренера",
    );
    await notesUxTick();
    expect(denied).toHaveBeenCalledTimes(1);
  });
  it("503 error retries same GET manually and shows only fresh 200 metadata", async () => {
    let n = 0;
    const paths: string[] = [];
    const transport = vi.fn(async (path: string) => {
      paths.push(path);
      return ++n === 1
        ? notesUxResponse(503)
        : notesUxResponse(200, [notesUxRow("FRESH_NOTES_200", "fresh-note")]);
    });
    await notesUxMount("A", transport);
    expect(host.textContent).toContain("Не удалось загрузить заметки");
    expect(host.textContent).not.toContain("FRESH_NOTES_200");
    expect(notesUxRetry()).toBeDefined();
    await act(async () => notesUxRetry()?.click());
    await notesUxTick();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(paths).toEqual([
      "/api/v1/trainer/notes/summary?page=0&pageSize=2",
      "/api/v1/trainer/notes/summary?page=0&pageSize=2",
    ]);
    expect(host.textContent).toContain("FRESH_NOTES_200");
    expect(host.textContent).toContain("Всего заметок: 1");
    expect(host.textContent).not.toContain("Не удалось загрузить заметки");
  });
  it("401 keeps existing generic error and manual retry (session policy unchanged)", async () => {
    await notesUxMount("A", async () => notesUxResponse(401));
    expect(host.textContent).toContain("Не удалось загрузить заметки");
    expect(notesUxRetry()).toBeDefined();
    expect(host.textContent).not.toContain("Нет доступа к заметкам");
  });
  it("late old-actor success cannot revive content after new-actor 403", async () => {
    let releaseOld!: (value: ReturnType<typeof notesUxResponse>) => void;
    const late = new Promise<ReturnType<typeof notesUxResponse>>((resolve) => {
      releaseOld = resolve;
    });
    await notesUxMount("A", async () => late);
    await notesUxMount("B", async () => notesUxResponse(403), "new-notes-e");
    expect(host.textContent).toContain("Нет доступа к заметкам");
    await act(async () =>
      releaseOld(notesUxResponse(200, [notesUxRow("LATE_ACTOR_A_NOTE", "old-private")])),
    );
    await notesUxTick();
    expect(host.textContent).not.toContain("LATE_ACTOR_A_NOTE");
    expect(host.textContent).not.toContain("Всего заметок");
    expect(notesUxRetry()).toBeUndefined();
  });
});


// Scoped Notes READ pagination interaction: existing source mounted with injected GET only.
describe("AG2_NOTES_ONE_TRANSITION_PER_READY_PAGE mounted-local", () => {
  const path = "/api/v1/trainer/notes/summary";
  const pagePath = (page: number) => `${path}?page=${page}&pageSize=2`;
  const row = (id: string) => ({
    id, title: `Note ${id}`, tags: ["safe"], createdAt: "2026-10-24T09:00:00.000Z",
  });
  const success = (page: number, total = 6) => ({
    status: 200, headers: { "cache-control": "private, no-store" },
    body: { success: true, data: { notes: [row(`p${page}`)], total, page, pageSize: 2 } },
  });
  const failure = () => ({
    status: 503, headers: { "cache-control": "private, no-store" },
    body: { success: false, code: "TEMP_FAILURE" },
  });
  const deferred = () => {
    let resolve!: (value: ReturnType<typeof success>) => void;
    const promise = new Promise<ReturnType<typeof success>>(finish => { resolve = finish; });
    return { promise, resolve };
  };
  type Transport = (request: string, signal: AbortSignal) => Promise<{
    status: number; headers: Record<string, string>; body: unknown;
  }>;
  async function localMount(transport: Transport, who: "A" | "B" = "A", epoch = "nav-epoch") {
    const person = actors[who];
    const actor = { id: person.id, role: person.role };
    const token = jwt[who];
    await act(async () => root.render(createElement(TrainerNotesRead20261022, {
      pathname: "/main-panel/notes", actor, token, authEpoch: epoch, enabled: true,
      pageSize: 2, transport,
      getCurrentSession: () => ({ actor, token, authEpoch: epoch }),
    })));
    await notesUxTick();
  }
  const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(b => b.textContent === name)!;
  const next = "Следующая страница";
  const prev = "Предыдущая страница";

  it("same-turn double next and mixed next/prev accept only first transition", async () => {
    const paths: string[] = [];
    const transport = vi.fn(async (request: string) => {
      paths.push(request);
      return success(Number(new URL(request, "http://localhost").searchParams.get("page")));
    });
    await localMount(transport);
    expect(host.textContent).toContain("Страница 1");
    await act(async () => { button(next).click(); button(next).click(); });
    await notesUxTick();
    expect(paths).toEqual([pagePath(0), pagePath(1)]);
    expect(host.textContent).toContain("Страница 2");
    expect(host.textContent).toContain("Note p1");
    await act(async () => { button(next).click(); button(prev).click(); });
    await notesUxTick();
    expect(paths).toEqual([pagePath(0), pagePath(1), pagePath(2)]);
    expect(host.textContent).toContain("Страница 3");
    expect(host.textContent).toContain("Note p2");
    expect(state.write).not.toHaveBeenCalled();
  });
  it("first and last page bounds hold even for direct disabled handler; allow next after back", async () => {
    const paths: string[] = [];
    const t = vi.fn(async (request: string) => {
      paths.push(request);
      return success(Number(new URL(request, "http://localhost").searchParams.get("page")), 4);
    });
    await localMount(t);
    await act(async () => button(prev).click());
    expect(paths).toEqual([pagePath(0)]);
    await act(async () => { button(next).click(); button(next).click(); });
    await notesUxTick();
    expect(paths).toEqual([pagePath(0), pagePath(1)]);
    expect(button(next).disabled).toBe(true);
    await act(async () => button(next).click());
    expect(paths).toEqual([pagePath(0), pagePath(1)]);
    await act(async () => { button(prev).click(); button(next).click(); });
    await notesUxTick();
    expect(paths).toEqual([pagePath(0), pagePath(1), pagePath(0)]);
    await act(async () => button(next).click());
    await notesUxTick();
    expect(paths).toEqual([pagePath(0), pagePath(1), pagePath(0), pagePath(1)]);
    expect(host.textContent).toContain("Страница 2");
  });
  it("during pending GET old buttons cannot enqueue; confirmed read allows the next page", async () => {
    const paths: string[] = []; const waiting = deferred(); let pageOneReads = 0;
    const t = vi.fn(async (request: string) => {
      paths.push(request);
      if (request === pagePath(0)) return success(0);
      if (request === pagePath(1)) return ++pageOneReads === 1 ? waiting.promise : success(1);
      if (request === pagePath(2)) return success(2);
      throw Error("unexpected notes GET");
    });
    await localMount(t);
    const staleNext = button(next);
    await act(async () => { staleNext.click(); staleNext.click(); });
    expect(host.textContent).toContain("Загрузка заметок");
    await act(async () => staleNext.click());
    expect(paths).toEqual([pagePath(0), pagePath(1)]);
    await act(async () => waiting.resolve(success(1)));
    await notesUxTick();
    expect(host.textContent).toContain("Note p1");
    await act(async () => button(next).click());
    await notesUxTick();
    expect(host.textContent).toContain("Note p2");
    expect(paths).toEqual([pagePath(0), pagePath(1), pagePath(2)]);
    expect(state.write).not.toHaveBeenCalled();
  });
  it("failed next GET has no false empty, manual Retry recovers and enables subsequent page navigation", async () => {
    const paths: string[] = []; let tries = 0;
    const t = vi.fn(async (request: string) => {
      paths.push(request);
      const p = Number(new URL(request, "http://localhost").searchParams.get("page"));
      if (p === 1 && ++tries === 1) return failure();
      return success(p);
    });
    await localMount(t);
    await act(async () => { button(next).click(); button(next).click(); });
    await notesUxTick();
    expect(host.textContent).toContain("Не удалось загрузить заметки");
    expect(host.textContent).not.toContain("Заметок нет");
    expect(paths).toEqual([pagePath(0), pagePath(1)]);
    await act(async () => notesUxRetry()?.click());
    await notesUxTick();
    expect(host.textContent).toContain("Страница 2");
    expect(host.textContent).toContain("Note p1");
    await act(async () => { button(next).click(); button(next).click(); });
    await notesUxTick();
    expect(paths).toEqual([pagePath(0), pagePath(1), pagePath(1), pagePath(2)]);
    expect(host.textContent).toContain("Note p2");
  });
  it("retired actor ignores old delayed page ACK and starts fresh without stale details", async () => {
    const waiting = deferred(); const requests: string[] = [];
    const old = vi.fn(async (request: string) => {
      requests.push(request);
      if (request === pagePath(0)) return success(0);
      return waiting.promise;
    });
    await localMount(old);
    await act(async () => button(next).click());
    expect(host.textContent).toContain("Загрузка заметок");
    const currentActor = vi.fn(async (request: string) => {
      requests.push(`B:${request}`);
      return success(1);
    });
    await localMount(currentActor, "B", "epoch-B");
    expect(host.textContent).toContain("Страница 2");
    expect(host.textContent).not.toContain("Note p0");
    await act(async () => waiting.resolve(success(1)));
    await notesUxTick();
    expect(host.textContent).not.toContain("Note p0");
    expect(host.textContent).toContain("Note p1");
    expect(state.write).not.toHaveBeenCalled();
  });
});
