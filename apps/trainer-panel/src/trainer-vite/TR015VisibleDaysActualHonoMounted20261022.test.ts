/**
 * AG1 visible-days frozen producer: ACTUAL registered Hono ->
 * ACTUAL existing trainingDay.getVisibleDays Core -> synthetic Prisma.
 * Signed JWT/auth, privacy and rate middleware are actual in-process.
 * No Core mock, real SQL, HTTP server/browser/TLS/device or day writes.
 */
import { randomBytes } from "node:crypto";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { TrainerVisibleDaysChooser20261022 } from "./TrainerVisibleDaysChooser20261022";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  find: vi.fn(),
  session: vi.fn(),
  registration: vi.fn(),
  write: vi.fn(),
  otherRead: vi.fn(),
  rateKeys: [] as string[],
  limited: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(o: { windowMs: number }) {
      this.windowMs = o.windowMs;
    }
    async increment(key: string) {
      m.rateKeys.push(key);
      return { totalHits: m.limited ? 101 : 1, resetTime: new Date(Date.now() + this.windowMs) };
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
      user: { ...actual.prisma.user, findUnique: m.session },
      trainingDay: {
        ...actual.prisma.trainingDay,
        findMany: m.find,
        create: m.write,
        update: m.write,
        delete: m.write,
        deleteMany: m.write,
      },
      dayOnCourse: {
        ...actual.prisma.dayOnCourse,
        create: m.write,
        createMany: m.write,
        delete: m.write,
        deleteMany: m.write,
      },
      stepOnDay: {
        ...actual.prisma.stepOnDay,
        create: m.write,
        delete: m.write,
        deleteMany: m.write,
      },
      $transaction: m.write,
    },
  };
});
vi.mock("@gafus/core/services/auth", async (original) => ({
  ...(await original<object>()),
  isRegistrationCompleted: m.registration,
}));
// NEVER mock @gafus/core/services/trainingDay.
const { app } = await vi.importActual<{
  app: { request: (path: string, init?: RequestInit) => Promise<Response> };
}>("../../../api/src/app");
const { generateAccessToken } = await vi.importActual<{
  generateAccessToken: (actor: { id: string; username: string; role: string }) => Promise<string>;
}>("@gafus/auth/jwt");

const PATH = "/api/v1/trainer/days";
const SECRET = "AG1_VISIBLE_DAYS_PRIVATE_EMAIL_STUDENT_NOTE_MEDIA_PROVIDER";
const actors = {
  A: { id: "trainer-days-A", username: "trainer_a", role: "TRAINER" },
  B: { id: "trainer-days-B", username: "trainer_b", role: "TRAINER" },
  ADMIN: { id: "trainer-days-admin", username: "admin", role: "ADMIN" },
  MOD: { id: "trainer-days-moderator", username: "moderator", role: "MODERATOR" },
  USER: { id: "trainer-days-user", username: "user", role: "USER" },
  PARTNER: { id: "trainer-days-partner", username: "partner", role: "PARTNER" },
} as const;
const token: Record<string, string> = {};
const date = (iso: string) => new Date(iso);
type StepLink = {
  id: string;
  order: number;
  privateProgress: string;
  step: { id: string; title: string; privateVideo: string };
};
type DayLink = {
  id: string;
  order: number;
  privateAccess: string;
  course: { id: string; name: string; paymentSecret: string };
};
type Stored = {
  id: string;
  title: string;
  equipment: string;
  description: string;
  type: string;
  authorId: string;
  showCoursePathExport: boolean;
  shareProgressAcrossCourses: boolean;
  createdAt: Date;
  updatedAt: Date;
  privateDiary: string;
  privateCost: string;
  author: {
    username: string;
    email: string;
    profile: {
      fullName: string | null;
      privatePhone: string;
    } | null;
  };
  stepLinks: StepLink[];
  dayLinks: DayLink[];
};
const stepLinks = (prefix: string): StepLink[] =>
  [2, 1].map((n) => ({
    id: prefix + "-sl" + n,
    order: n,
    privateProgress: SECRET,
    step: { id: prefix + "-step" + n, title: "Step " + n, privateVideo: SECRET },
  }));
const dayLinks = (prefix: string): DayLink[] =>
  [3, 1].map((n) => ({
    id: prefix + "-dl" + n,
    order: n,
    privateAccess: SECRET,
    course: { id: prefix + "-course" + n, name: "Course " + n, paymentSecret: SECRET },
  }));
function day(id: string, owner: string, created: string, extras: Partial<Stored> = {}): Stored {
  return {
    id,
    title: "Day " + id,
    equipment: "leash",
    description: "Daily plan",
    type: "regular",
    authorId: owner,
    showCoursePathExport: true,
    shareProgressAcrossCourses: false,
    createdAt: date(created),
    updatedAt: date("2026-10-22T12:00:00.000Z"),
    privateDiary: SECRET,
    privateCost: SECRET,
    author: {
      username: "account_" + owner,
      email: SECRET,
      profile: { fullName: "Trainer " + owner, privatePhone: SECRET },
    },
    stepLinks: stepLinks(id),
    dayLinks: dayLinks(id),
    ...extras,
  };
}
const source: Stored[] = [
  day("A-old", actors.A.id, "2026-10-18T00:00:00.000Z"),
  day("B-one", actors.B.id, "2026-10-20T00:00:00.000Z"),
  day("A-new", actors.A.id, "2026-10-22T00:00:00.000Z", {
    author: { username: "a-new", email: SECRET, profile: null },
    stepLinks: [],
    dayLinks: [],
  }),
];
const _request = (who: string, suffix = "", method = "GET") =>
  app.request(PATH + suffix, {
    method,
    headers: who
      ? {
          authorization: "Bearer " + (token[who] ?? who),
        }
      : {},
  });
const _assertPrivate = (r: Response) => {
  const cc = (r.headers.get("cache-control") ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  expect(cc).toContain("private");
  expect(cc).toContain("no-store");
  expect(cc).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const _noWrites = () => {
  expect(m.write).not.toHaveBeenCalled();
  expect(m.otherRead).not.toHaveBeenCalled();
};
function _assertCoreQuery(owner?: string) {
  expect(m.find).toHaveBeenCalledExactlyOnceWith({
    where: owner ? { authorId: owner } : {},
    include: {
      author: { select: { username: true, profile: { select: { fullName: true } } } },
      stepLinks: {
        include: { step: { select: { id: true, title: true } } },
        orderBy: { order: "asc" },
      },
      dayLinks: {
        include: { course: { select: { id: true, name: true } } },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [alias, actor] of Object.entries(actors))
    token[alias] = await generateAccessToken(actor);
});
beforeEach(() => {
  vi.clearAllMocks();
  m.limited = false;
  m.rateKeys.length = 0;
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role } : null;
  });
  m.registration.mockResolvedValue(true);
  m.find.mockImplementation(async (args: { where: { authorId?: string } }) =>
    source
      .filter((row) => !args.where.authorId || row.authorId === args.where.authorId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => ({
        ...row,
        stepLinks: [...row.stepLinks].sort((a, b) => a.order - b.order),
        dayLinks: [...row.dayLinks].sort((a, b) => a.order - b.order),
      })),
  );
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
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function mount(who: "A" | "ADMIN" | "MOD" = "A", current = () => true) {
  const actor = actors[who];
  const transport = async (path: string, signal: AbortSignal) => {
    const response = await app.request(path, {
      method: "GET",
      signal,
      headers: { authorization: "Bearer " + token[who] },
    });
    return {
      status: response.status,
      headers: { "cache-control": response.headers.get("cache-control") ?? "" },
      body: await response.json(),
    };
  };
  await act(async () =>
    root.render(
      createElement(TrainerVisibleDaysChooser20261022, {
        actor,
        enabled: true,
        transport,
        isCurrent: current,
      }),
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function choose(title: string) {
  await act(async () =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === title)!.click(),
  );
}
describe("AG4 existing course editor read-only day chooser → ACTUAL Hono→Core→synthetic Prisma", () => {
  it("TRAINER own list, detail ordered steps/courses, no writes", async () => {
    await mount("A");
    expect(host.textContent).toContain("Day A-new");
    expect(host.textContent).toContain("Day A-old");
    expect(host.textContent).not.toContain("Day B-one");
    await choose("Day A-old");
    const details = host.querySelector('[aria-label="Подробности выбранного дня"]')!;
    expect(details.textContent).toContain("Step 1");
    expect(details.textContent!.indexOf("Step 1")).toBeLessThan(
      details.textContent!.indexOf("Step 2"),
    );
    expect(details.textContent!.indexOf("Course 1")).toBeLessThan(
      details.textContent!.indexOf("Course 3"),
    );
    expect(m.write).not.toHaveBeenCalled();
  });
  it("elevated mixed, empty, error, retired session fail closed", async () => {
    await mount("ADMIN");
    expect(host.textContent).toContain("Day B-one");
    m.find.mockResolvedValueOnce([]);
    await mount("MOD");
    expect(host.textContent).toContain("Дней нет");
    m.find.mockRejectedValueOnce(Error("private db"));
    await mount("A");
    expect(host.textContent).toContain("Не удалось загрузить дни");
    await mount("A", () => false);
    expect(host.textContent).toContain("Список дней недоступен");
    expect(m.write).not.toHaveBeenCalled();
  });
});

// Source-mounted READ usability regression; uses the existing day DTO/transport, no Hono call.
describe("AG2_TR015_DAY_ALREADY_ORDERED_METADATA mounted-local", () => {
  const iso = "2026-10-22T12:00:00.000Z";
  const step = (id: string, order: number, title: string) => ({
    id,
    order,
    step: { id: `step-${id}`, title },
  });
  const course = (id: string, order: number, name: string) => ({
    id,
    order,
    course: { id: `course-${id}`, name },
  });
  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    title: `День ${id}`,
    equipment: "",
    description: `Описание ${id}`,
    type: "regular",
    authorId: actors.A.id,
    showCoursePathExport: false,
    shareProgressAcrossCourses: false,
    createdAt: iso,
    updatedAt: iso,
    author: { username: "trainer", profile: null },
    stepLinks: [step(`${id}-1`, 1, "Шаг первый")],
    dayLinks: [course(`${id}-1`, 1, "Курс первый")],
    ...overrides,
  });
  const response = (rows: unknown[]) => ({
    status: 200,
    headers: { "cache-control": "private, no-store" },
    body: { success: true, data: rows },
  });
  const transport = (rows: unknown[]) =>
    vi.fn(async (_path: string, _signal: AbortSignal) => response(rows));
  async function localMount(t: ReturnType<typeof transport>, who: "A" | "ADMIN" = "A") {
    await act(async () =>
      root.render(
        createElement(TrainerVisibleDaysChooser20261022, {
          actor: actors[who],
          enabled: true,
          transport: t,
          isCurrent: () => true,
        }),
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  const details = () =>
    host.querySelector<HTMLElement>('[aria-label="Подробности выбранного дня"]');
  it("shows the selected day existing equipment/type as escaped plain text, no extra GET", async () => {
    const original = row("dog", { type: "TRAINING_KIND", equipment: "Поводок <b>для собак</b>" });
    const snapshot = JSON.stringify(original);
    const t = transport([original]);
    await localMount(t);
    expect(details()).toBeNull();
    await choose("День dog");
    expect(details()?.textContent).toContain("Тип: TRAINING_KIND");
    expect(details()?.textContent).toContain("Оборудование: Поводок <b>для собак</b>");
    expect(details()?.querySelector("b,img,video,iframe,script,a")).toBeNull();
    expect(details()?.textContent).toContain("Описание dog");
    expect(t).toHaveBeenCalledExactlyOnceWith(PATH, expect.any(AbortSignal));
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("empty equipment/type use explicit fallback; stable equal-order ties and repeated step occurrences remain", async () => {
    const links = [
      step("occ-1", 1, "Повторяемый шаг"),
      step("occ-2", 1, "Повторяемый шаг"),
      step("occ-3", 2, "Заключительный шаг"),
    ];
    const courses = [course("c-1", 1, "Первый курс"), course("c-2", 2, "Второй курс")];
    const original = row("repeated", {
      type: "",
      equipment: "",
      stepLinks: links,
      dayLinks: courses,
    });
    const frozen = JSON.stringify(original);
    const t = transport([original]);
    await localMount(t);
    await choose("День repeated");
    const d = details()!;
    expect(d.textContent).toContain("Тип: Не указано");
    expect(d.textContent).toContain("Оборудование: Не указано");
    const steps = Array.from(d.querySelectorAll("ol:first-of-type li")).map((e) => e.textContent);
    expect(steps).toEqual(["Повторяемый шаг", "Повторяемый шаг", "Заключительный шаг"]);
    expect(d.textContent!.indexOf("Первый курс")).toBeLessThan(
      d.textContent!.indexOf("Второй курс"),
    );
    expect(JSON.stringify(original)).toBe(frozen);
    expect(t).toHaveBeenCalledTimes(1);
  });
  it("an out-of-order stepLinks transport payload is rejected by existing parser, not silently reordered", async () => {
    const unsorted = row("out-of-order", {
      stepLinks: [step("s2", 2, "Второй"), step("s1", 1, "Первый")],
    });
    const original = JSON.stringify(unsorted);
    const t = transport([unsorted]);
    await localMount(t);
    expect(host.textContent).toContain("Не удалось загрузить дни");
    expect(host.textContent).not.toContain("День out-of-order");
    expect(details()).toBeNull();
    expect(JSON.stringify(unsorted)).toBe(original);
    expect(t).toHaveBeenCalledTimes(1);
  });
  it("changing selected day replaces metadata without extra request; actor change clears old details", async () => {
    const t = transport([
      row("new", { type: "EXAM", equipment: "Поводок" }),
      row("old", { type: "PRACTICE", equipment: "Мяч" }),
    ]);
    await localMount(t);
    await choose("День new");
    expect(details()?.textContent).toContain("Оборудование: Поводок");
    await choose("День old");
    expect(details()?.textContent).toContain("Оборудование: Мяч");
    expect(details()?.textContent).not.toContain("Поводок");
    expect(t).toHaveBeenCalledTimes(1);
    const forbidden = transport([]);
    await localMount(forbidden, "ADMIN");
    expect(details()).toBeNull();
    expect(host.textContent).not.toContain("Мяч");
    expect(forbidden).toHaveBeenCalledTimes(1);
    expect(m.write).not.toHaveBeenCalled();
  });

  // Original existing chooser navigation: search only its current confirmed title list.
  describe("AG2_TR015_VISIBLE_DAYS_TITLE_SEARCH_LOCAL mounted-local", () => {
    const list = () => host.querySelector<HTMLUListElement>("section[aria-label=\"Выбор тренировочного дня\"] > ul");
    const titles = () => Array.from(list()?.querySelectorAll<HTMLButtonElement>("li > button") ?? [])
      .map((button) => button.textContent ?? "");
    const input = () => host.querySelector<HTMLInputElement>("input[aria-label=\"Поиск дня по названию\"]");
    const clear = () => [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent === "Очистить поиск");
    const fixed = (rows: unknown[]) => transport(rows);
    async function search(value: string) {
      const field = input()!;
      expect(field).not.toBeNull();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
      expect(setter).toBeDefined();
      await act(async () => {
        setter!.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    it("confirmed empty GET means no days rather than no search matches; truthful 0/0 count", async () => {
      const t = fixed([]);
      await localMount(t);
      expect(input()).not.toBeNull();
      expect(host.textContent).toContain("Дней нет");
      expect(host.textContent).not.toContain("По запросу ничего не найдено");
      expect(host.textContent).toContain("Загружено дней: 0; показано: 0");
      expect(clear()).toBeUndefined();
      expect(t).toHaveBeenCalledTimes(1);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("title-only trim/case-insensitive search, no description match, local clear restores original order with zero GET", async () => {
      const original = [
        row("first", { title: "СОБАКА на прогулке", description: "Первое описание" }),
        row("second", { title: "Кошачий курс", description: "PRIVATE_DESCRIPTION_ONLY" }),
      ];
      const frozen = JSON.stringify(original);
      const t = fixed(original);
      await localMount(t);
      expect(titles()).toEqual(["СОБАКА на прогулке", "Кошачий курс"]);
      await search("  собака  ");
      expect(titles()).toEqual(["СОБАКА на прогулке"]);
      expect(host.textContent).toContain("Загружено дней: 2; показано: 1");
      await search("PRIVATE_DESCRIPTION_ONLY");
      expect(titles()).toHaveLength(0);
      expect(host.textContent).toContain("По запросу ничего не найдено");
      expect(host.textContent).not.toContain("Дней нет");
      expect(host.textContent).not.toContain("PRIVATE_DESCRIPTION_ONLY");
      expect(host.textContent).toContain("Загружено дней: 2; показано: 0");
      await act(async () => clear()?.click());
      expect(input()?.value).toBe("");
      expect(titles()).toEqual(["СОБАКА на прогулке", "Кошачий курс"]);
      expect(host.textContent).toContain("Загружено дней: 2; показано: 2");
      expect(clear()).toBeUndefined();
      expect(JSON.stringify(original)).toBe(frozen);
      expect(t).toHaveBeenCalledTimes(1);
    });
    it("excluded selected day has no details; clear restores existing row, repeat occurrences and metadata without GET", async () => {
      const repeated = row("first", {
        title: "Занятие ОДИН", type: "PRACTICE", equipment: "Поводок",
        stepLinks: [step("occ-1", 1, "Один шаг"), step("occ-2", 1, "Один шаг")],
      });
      const t = fixed([repeated, row("second", { title: "Занятие ДВА" })]);
      await localMount(t);
      await choose("Занятие ОДИН");
      expect(details()?.textContent).toContain("Поводок");
      expect(details()?.querySelectorAll("ol:first-of-type li")).toHaveLength(2);
      await search("два");
      expect(titles()).toEqual(["Занятие ДВА"]);
      expect(details()).toBeNull();
      await search("no-match");
      expect(details()).toBeNull();
      expect(host.textContent).toContain("По запросу ничего не найдено");
      await act(async () => clear()?.click());
      expect(titles()).toEqual(["Занятие ОДИН", "Занятие ДВА"]);
      expect(details()?.textContent).toContain("Оборудование: Поводок");
      expect(details()?.textContent).toContain("Тип: PRACTICE");
      expect([...details()!.querySelectorAll("ol:first-of-type li")].map(li => li.textContent))
        .toEqual(["Один шаг", "Один шаг"]);
      expect(t).toHaveBeenCalledTimes(1);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("loading/error/disabled remain their actual states, not false filter-empty or retained detail", async () => {
      const delayed = (() => {
        let resolve!: (value: ReturnType<typeof response>) => void;
        const promise = new Promise<ReturnType<typeof response>>(done => { resolve = done; });
        return { promise, resolve };
      })();
      const old = fixed([row("first", { title: "День старый", equipment: "PRIVATE_EQUIPMENT" })]);
      await localMount(old);
      await choose("День старый");
      await search("старый");
      const pending = vi.fn(async (_path: string, _signal: AbortSignal) => delayed.promise);
      await localMount(pending);
      expect(host.textContent).toContain("Загрузка тренировочных дней");
      expect(host.textContent).not.toContain("PRIVATE_EQUIPMENT");
      expect(host.textContent).not.toContain("По запросу ничего не найдено");
      expect(details()).toBeNull();
      await act(async () => delayed.resolve({
        status: 503, headers: {"cache-control":"private, no-store"}, body: {success:false,data:[]},
      }));
      expect(host.textContent).toContain("Не удалось загрузить дни");
      expect(host.textContent).not.toContain("По запросу ничего не найдено");
      await act(async () => root.render(createElement(TrainerVisibleDaysChooser20261022, {
        actor: actors.A, enabled: false, transport: old, isCurrent: () => true,
      })));
      expect(host.textContent).toContain("Список дней недоступен");
      expect(input()).toBeNull();
      expect(details()).toBeNull();
      await localMount(fixed([row("fresh", { title: "День новый" })]));
      expect(input()?.value).toBe("");
      expect(titles()).toEqual(["День новый"]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("actor id/role change clears previous query and old selection; return does not revive search", async () => {
      const initial = fixed([row("private", { title: "PRIVATE_A_DAY", equipment: "SECRET_A_EQUIPMENT" })]);
      await localMount(initial);
      await search("PRIVATE_A_DAY");
      await choose("PRIVATE_A_DAY");
      expect(details()?.textContent).toContain("SECRET_A_EQUIPMENT");
      const admin = fixed([row("admin", { title: "ADMIN_VISIBLE_DAY" })]);
      await localMount(admin, "ADMIN");
      expect(input()?.value).toBe("");
      expect(titles()).toEqual(["ADMIN_VISIBLE_DAY"]);
      expect(details()).toBeNull();
      expect(host.textContent).not.toContain("SECRET_A_EQUIPMENT");
      const back = fixed([row("returned", { title: "RETURNED_A_DAY" })]);
      await localMount(back);
      expect(input()?.value).toBe("");
      expect(titles()).toEqual(["RETURNED_A_DAY"]);
      expect(details()).toBeNull();
      expect(initial).toHaveBeenCalledTimes(1);
      expect(admin).toHaveBeenCalledTimes(1);
      expect(back).toHaveBeenCalledTimes(1);
      expect(m.write).not.toHaveBeenCalled();
    });
  });
});
