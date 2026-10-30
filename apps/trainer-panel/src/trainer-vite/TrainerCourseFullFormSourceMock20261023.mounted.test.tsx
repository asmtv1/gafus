// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { TrainerOptInRoute } from "./optInRoute";
import type { CourseFormSourceMockTransport } from "./trainerCourseFullFormSourceMockTransport20261023";
import type { PanelActor } from "./consultationContract";
const h = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
const actor: PanelActor = { id: "trainer-a", role: "TRAINER" };
const pathNew = "/main-panel/courses/new";
const pathEdit = "/main-panel/courses/course-1/edit";
const day = (id: string, createdAt: string) => ({
  id,
  title: id.toUpperCase(),
  equipment: "",
  description: "",
  type: "REGULAR",
  authorId: "trainer-a",
  showCoursePathExport: false,
  shareProgressAcrossCourses: false,
  createdAt,
  updatedAt: createdAt,
  author: { username: "trainer-a", profile: null },
  stepLinks: [],
  dayLinks: [],
});
const listed = [day("d1", "2026-10-23T00:00:00.000Z"), day("d2", "2026-10-22T00:00:00.000Z")];
const snapshot = (version = 4, id = "course-1", name = "Старое имя") => ({
  id,
  version,
  name,
  guideContent: null,
  shortDesc: "",
  description: "Старое описание",
  duration: "7 дней",
  videoUrl: null,
  logoImg: "",
  isPrivate: false,
  isPaid: false,
  showInProfile: true,
  isPersonalized: false,
  equipment: "",
  trainingLevel: "BEGINNER",
  dayLinks: [{ id: "link-1", dayId: "d1", order: 1, day: { id: "d1", title: "D1" } }],
  access: [],
});
const ok = (status: number, body: unknown) => ({ status, headers: h, body });
const response = (body: unknown, status = 200) => ok(status, { success: true, data: body });
type Request = Parameters<CourseFormSourceMockTransport>[0];
let host: HTMLDivElement, root: Root;
let mock: ReturnType<typeof vi.fn<(input: Request) => Promise<ReturnType<typeof ok>>>>;
let live: { actor: PanelActor; token: string | null; authEpoch?: string } | null;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  live = { actor, token: "fixture-token", authEpoch: "epoch-a" };
  mock = vi.fn(async (request) => {
    if (request.path === "/api/v1/trainer/days") return response(listed);
    if (request.path.endsWith("/editor-snapshot")) return response(snapshot());
    if (request.method === "POST") return response({ id: "created-1" }, 201);
    if (request.method === "PUT") return response({ id: "course-1", version: 5 });
    throw Error(`UNEXPECTED ${request.method} ${request.path}`);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function mount(extra: Record<string, unknown> = {}) {
  const props = {
    pathname: pathEdit,
    actor,
    token: "fixture-token",
    authEpoch: "epoch-a",
    fetchImpl: vi.fn(),
    getCurrentSession: () => live,
    enableCourseFullFormSourceMock: true,
    courseFullFormSourceMockTransport: mock,
    ...extra,
  };
  await act(async () => root.render(createElement(TrainerOptInRoute, props)));
  await flush();
  return props;
}
function button(text: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === text,
  );
}
function namedInput(name: string) {
  const item = host.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${name}"]`);
  if (!item) throw Error(`MISSING_INPUT:${name}`);
  return item;
}
async function type(name: string, value: string) {
  const input = namedInput(name);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(text: string) {
  const b = button(text);
  expect(b, `button ${text}`).toBeDefined();
  await act(async () => b?.click());
  await flush();
}
function calls(method: string) {
  return mock.mock.calls.filter(([req]) => req.method === method);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("COURSE011/TR012 dormant mocked full CourseForm", () => {
  it("default absent, missing mock port, missing actor session, wrong role and new route remain OFF", async () => {
    await mount({ enableCourseFullFormSourceMock: false });
    expect(mock).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Бесплатный публичный курс — без медиа");
    await mount({ pathname: pathNew, enableCourseFullFormSourceMock: false });
    expect(mock).not.toHaveBeenCalled();
    await mount({ courseFullFormSourceMockTransport: undefined });
    expect(mock).not.toHaveBeenCalled();
    await mount({ actor: { id: "moderator", role: "MODERATOR" } });
    expect(mock).not.toHaveBeenCalled();
    await mount({ token: null });
    expect(mock).not.toHaveBeenCalled();
    await mount({ authEpoch: undefined });
    expect(mock).not.toHaveBeenCalled();
    live = null;
    await mount();
    expect(mock).not.toHaveBeenCalled();
  });
  it("mock create only: editable scalar fields, exact restricted wire, duplicate ordered days, 201 ID then GET", async () => {
    mock.mockImplementation(async (req) => {
      if (req.path === "/api/v1/trainer/days") return response(listed);
      if (req.method === "POST") return response({ id: "created-1" }, 201);
      if (req.method === "GET" && req.path.endsWith("/editor-snapshot"))
        return response(snapshot(1, "created-1", "Новый курс"));
      throw Error("UNEXPECTED");
    });
    await mount({ pathname: pathNew });
    await type("Название курса", "Новый курс");
    await type("Продолжительность", "21 день");
    await type("Краткое описание", "Коротко");
    await type("Полное описание", "Текст");
    await type("Текст мини-гайда", "Мини-гайд");
    await type("Оборудование", "Поводок");
    await click("Добавить D1");
    await click("Добавить D2");
    await click("Добавить D1");
    expect([...host.querySelectorAll('ol[aria-label="Выбранные дни"] li')]).toHaveLength(3);
    await click("Создать курс");
    expect(calls("POST")).toHaveLength(1);
    expect(calls("PUT")).toHaveLength(0);
    const sent = calls("POST")[0]![0].payload;
    expect(sent).toMatchObject({
      name: "Новый курс",
      duration: "21 день",
      shortDesc: "Коротко",
      isPublic: true,
      isPaid: false,
      logoImg: "",
      videoUrl: null,
      allowedUsers: [],
      trainingDays: ["d1", "d2", "d1"],
    });
    expect(sent).not.toHaveProperty("id");
    expect(sent).not.toHaveProperty("expectedVersion");
    expect(calls("GET").map(([r]) => r.path)).toContain(
      "/api/v1/trainer/courses/created-1/editor-snapshot",
    );
    expect(host.textContent).toContain("Курс создан и проверен.");
    expect(host.textContent).toContain("Подтверждён ID курса: created-1");
    await click("Создать курс");
    expect(calls("POST")).toHaveLength(1);
  });
  it("edit coherent snapshot pinned version 4, preserves duplicate order and rereads version 5", async () => {
    mock.mockImplementation(async (req) => {
      if (req.path === "/api/v1/trainer/days") return response(listed);
      if (req.method === "GET")
        return response(
          snapshot(req.path.includes("editor-snapshot") && calls("PUT").length ? 5 : 4),
        );
      if (req.method === "PUT") return response({ id: "course-1", version: 5 });
      throw Error("UNEXPECTED");
    });
    await mount();
    await type("Название курса", "Моё новое название");
    await type("Полное описание", "Новый текст");
    await click("Добавить D2");
    await click("Добавить D1");
    const higher = host.querySelector<HTMLButtonElement>('button[aria-label="Выше день 3"]');
    await act(async () => higher?.click());
    await click("Сохранить изменения");
    expect(calls("PUT")).toHaveLength(1);
    expect(calls("PUT")[0]![0]).toMatchObject({
      method: "PUT",
      path: "/api/v1/trainer/courses/course-1",
      payload: {
        name: "Моё новое название",
        description: "Новый текст",
        expectedVersion: 4,
        trainingDays: ["d1", "d1", "d2"],
        isPaid: false,
        isPublic: true,
        logoImg: "",
        videoUrl: null,
        allowedUsers: [],
      },
    });
    expect(calls("GET").filter(([r]) => r.path.endsWith("editor-snapshot"))).toHaveLength(2);
    expect(host.textContent).toContain("Изменения сохранены и проверены.");
  });
  it("409 retains text and duplicate sequence until explicit coherent read and user confirmation", async () => {
    let server = 4;
    let saved = 0;
    mock.mockImplementation(async (req) => {
      if (req.path === "/api/v1/trainer/days") return response(listed);
      if (req.method === "GET") return response(snapshot(server));
      if (req.method === "PUT") {
        saved++;
        return saved === 1
          ? ok(409, { success: false, code: "STALE_VERSION" })
          : response({ id: "course-1", version: 6 });
      }
      throw Error("UNEXPECTED");
    });
    await mount();
    await type("Название курса", "МОЙ ЧЕРНОВИК");
    await click("Добавить D2");
    await click("Добавить D1");
    await click("Сохранить изменения");
    expect(calls("PUT")).toHaveLength(1);
    expect(namedInput("Название курса").value).toBe("МОЙ ЧЕРНОВИК");
    expect(host.textContent).toContain("Версия курса устарела");
    expect(button("Сохранить изменения")?.disabled).toBe(true);
    expect(host.querySelectorAll('ol[aria-label="Выбранные дни"] li')).toHaveLength(3);
    server = 5;
    await click("Перечитать снимок");
    expect(calls("GET").filter(([r]) => r.path.endsWith("editor-snapshot"))).toHaveLength(2);
    expect(namedInput("Название курса").value).toBe("МОЙ ЧЕРНОВИК");
    expect(button("Сохранить изменения")?.disabled).toBe(true);
    await click("Сверил изменения — использовать новую версию");
    await click("Сохранить изменения");
    expect(calls("PUT")).toHaveLength(2);
    expect(calls("PUT")[1]![0].payload).toMatchObject({
      expectedVersion: 5,
      name: "МОЙ ЧЕРНОВИК",
      trainingDays: ["d1", "d2", "d1"],
    });
  });
  it.each(["POST", "PUT"] as const)(
    "%s 500 ambiguous ACK: one dispatch, preserve form, never retry",
    async (method) => {
      mock.mockImplementation(async (req) => {
        if (req.path === "/api/v1/trainer/days") return response(listed);
        if (req.method === "GET") return response(snapshot());
        if (req.method === method)
          return ok(500, { success: false, code: "INTERNAL_SERVER_ERROR" });
        throw Error("UNEXPECTED");
      });
      await mount(method === "POST" ? { pathname: pathNew } : {});
      await type("Название курса", "ВАЖНЫЙ ТЕКСТ");
      await type("Продолжительность", "3 дня");
      await click(method === "POST" ? "Создать курс" : "Сохранить изменения");
      expect(calls(method)).toHaveLength(1);
      expect(host.textContent).toContain("Не удалось подтвердить сохранение");
      expect(namedInput("Название курса").value).toBe("ВАЖНЫЙ ТЕКСТ");
      expect(button(method === "POST" ? "Создать курс" : "Сохранить изменения")?.disabled).toBe(
        true,
      );
      if (method === "PUT") {
        await click("Перечитать снимок");
        expect(host.textContent).toContain("исход предыдущей записи неоднозначен");
        expect(calls(method)).toHaveLength(1);
      }
    },
  );
  it("private/media/paid/grants editor snapshots never permit PUT", async () => {
    for (const [index, change] of [
      { isPrivate: true },
      { isPaid: true },
      { logoImg: "https://host/logo" },
      { videoUrl: "https://host/video" },
      { access: [{ userId: "u", user: { id: "u", username: "u" } }] },
    ].entries()) {
      mock.mockImplementation(async (req) => {
        if (req.path === "/api/v1/trainer/days") return response(listed);
        if (req.method === "GET") return response({ ...snapshot(), ...change });
        throw Error("MUST_NOT_WRITE");
      });
      live = { actor, token: "fixture-token", authEpoch: `target-${index}` };
      await mount({ authEpoch: live.authEpoch });
      expect(host.textContent).toContain("Курс или операция недоступны.");
      expect(calls("PUT")).toHaveLength(0);
    }
  });
  it("same-turn double submit sends one POST while deferred, no invented create version", async () => {
    const deferredPost = deferred<ReturnType<typeof ok>>();
    mock.mockImplementation(async (req) => {
      if (req.path === "/api/v1/trainer/days") return response(listed);
      if (req.method === "POST") return deferredPost.promise;
      if (req.method === "GET") return response(snapshot(1, "created-1"));
      throw Error("UNEXPECTED");
    });
    await mount({ pathname: pathNew });
    await type("Название курса", "Один клик");
    await type("Продолжительность", "5 дней");
    const submit = button("Создать курс");
    expect(submit).toBeDefined();
    await act(async () => {
      submit?.click();
      submit?.click();
    });
    expect(calls("POST")).toHaveLength(1);
    expect(host.textContent).not.toContain("Версия: 1");
    await act(async () => deferredPost.resolve(response({ id: "created-1" }, 201)));
    await flush();
    expect(calls("POST")).toHaveLength(1);
    expect(host.textContent).toContain("Курс создан и проверен.");
  });
  it("retired actor/course late ACK never enters new actor form or triggers reread", async () => {
    const late = deferred<ReturnType<typeof ok>>();
    mock.mockImplementation(async (req) => {
      if (req.path === "/api/v1/trainer/days") return response(listed);
      if (req.method === "PUT") return late.promise;
      if (req.method === "GET")
        return response(
          snapshot(
            4,
            req.path.includes("course-2") ? "course-2" : "course-1",
            req.path.includes("course-2") ? "НОВЫЙ АКТЁР" : "СТАРЫЙ АКТЁР",
          ),
        );
      throw Error("UNEXPECTED");
    });
    await mount();
    await click("Сохранить изменения");
    expect(calls("PUT")).toHaveLength(1);
    live = { actor: { id: "trainer-b", role: "ADMIN" }, token: "token-b", authEpoch: "epoch-b" };
    await mount({
      actor: live.actor,
      token: live.token,
      authEpoch: live.authEpoch,
      pathname: "/main-panel/courses/course-2/edit",
    });
    expect(host.textContent).toContain("НОВЫЙ АКТЁР");
    await act(async () => late.resolve(response({ id: "course-1", version: 5 })));
    await flush();
    expect(host.textContent).toContain("НОВЫЙ АКТЁР");
    expect(host.textContent).not.toContain("Подтверждён ID курса: course-1");
    expect(calls("PUT")).toHaveLength(1);
  });
  it("malformed 201 ACK cannot mark create successful", async () => {
    mock.mockImplementation(async (req) => {
      if (req.path === "/api/v1/trainer/days") return response(listed);
      if (req.method === "POST") return response({ id: "created-1", secret: "extra" }, 201);
      throw Error("UNEXPECTED");
    });
    await mount({ pathname: pathNew });
    await type("Название курса", "Тест");
    await type("Продолжительность", "10 дней");
    await click("Создать курс");
    expect(calls("POST")).toHaveLength(1);
    expect(host.textContent).toContain("Не удалось подтвердить сохранение");
    expect(host.textContent).not.toContain("Курс создан и проверен");
  });
  it("create 201 ID followed by failed snapshot does not repeat POST; explicit GET can recover", async () => {
    let reads = 0;
    mock.mockImplementation(async (req) => {
      if (req.path === "/api/v1/trainer/days") return response(listed);
      if (req.method === "POST") return response({ id: "created-1" }, 201);
      if (req.method === "GET") {
        reads++;
        return reads === 1
          ? ok(503, { success: false, code: "INTERNAL_SERVER_ERROR" })
          : response(snapshot(1, "created-1"));
      }
      throw Error("UNEXPECTED");
    });
    await mount({ pathname: pathNew });
    await type("Название курса", "Проверить позже");
    await type("Продолжительность", "5 дней");
    await click("Создать курс");
    expect(calls("POST")).toHaveLength(1);
    expect(host.textContent).toContain("Подтверждён ID курса: created-1");
    expect(host.textContent).toContain("проверка курса не завершена");
    expect(button("Создать курс")?.disabled).toBe(true);
    await click("Перечитать снимок");
    expect(calls("POST")).toHaveLength(1);
    expect(calls("GET").filter(([req]) => req.path.endsWith("editor-snapshot"))).toHaveLength(2);
    expect(host.textContent).toContain("Курс найден и проверен.");
  });
  it("input limits block malformed writes; 403 blocks further create", async () => {
    mock.mockImplementation(async (req) => {
      if (req.path === "/api/v1/trainer/days") return response(listed);
      if (req.method === "POST") return ok(403, { success: false, code: "FORBIDDEN" });
      throw Error("UNEXPECTED");
    });
    await mount({ pathname: pathNew });
    await type("Название курса", "a".repeat(501));
    await type("Продолжительность", "10 дней");
    await click("Создать курс");
    expect(calls("POST")).toHaveLength(0);
    expect(host.textContent).toContain("Название: от 1 до 500 символов");
    await type("Название курса", "Обычный курс");
    await click("Создать курс");
    expect(calls("POST")).toHaveLength(1);
    expect(host.textContent).toContain("Операция недоступна.");
    expect(button("Создать курс")?.disabled).toBe(true);
  });
  it("invalid or foreign editor snapshots cannot authorize PUT", async () => {
    for (const [index, invalid] of [
      { ...snapshot(), id: "foreign-course" },
      { ...snapshot(), version: 0 },
      {
        ...snapshot(),
        dayLinks: [{ id: "l", dayId: "d1", order: 1, day: { id: "d2", title: "Wrong" } }],
      },
    ].entries()) {
      mock.mockImplementation(async (req) => {
        if (req.path === "/api/v1/trainer/days") return response(listed);
        if (req.method === "GET") return response(invalid);
        throw Error("WRITES_MUST_NOT_HAPPEN");
      });
      live = { actor, token: "fixture-token", authEpoch: `invalid-${index}` };
      await mount({ authEpoch: live.authEpoch });
      expect(button("Сохранить изменения")?.disabled).toBe(true);
      expect(calls("PUT")).toHaveLength(0);
    }
  });
});
