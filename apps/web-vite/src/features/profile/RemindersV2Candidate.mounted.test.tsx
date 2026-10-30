// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { ApiError } from "../../shared/api/client";
import { ProfileOverview } from "./ProfileOverview";
import type { SyntheticReminderTransport } from "./remindersSourceMock";
import {
  makeReminderV2DurableMock,
  makeReminderV2FakeAsyncCAS,
  type DurableCASStore,
  type DurableMarker,
} from "./reminderV2DurableSourceMock";
import {
  makeReminderV2Journal,
  REMINDER_V2_FIXTURE,
  type ReminderV2Transport,
} from "./reminderV2SourceCandidate";
const success = {
  id: "rem-new",
  name: "Вечером",
  enabled: true,
  reminderTime: "09:00",
  reminderDays: null,
  timezone: "UTC",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const defer = () => {
  let resolve!: (x: unknown) => void;
  const promise = new Promise<unknown>((r) => (resolve = r));
  return { promise, resolve };
};
let root: Root, host: HTMLDivElement, cache: QueryClient;
let transport: SyntheticReminderTransport;
let create: ReturnType<typeof vi.fn<ReminderV2Transport["create"]>>;
let lookup: ReturnType<typeof vi.fn<ReminderV2Transport["lookup"]>>;
let list: ReturnType<typeof vi.fn<SyntheticReminderTransport["list"]>>;
let legacyCreate: ReturnType<typeof vi.fn<NonNullable<SyntheticReminderTransport["create"]>>>;
let fetcher: ReturnType<typeof vi.fn>;
const pause = async () =>
  act(async () => {
    await new Promise((ok) => setTimeout(ok, 23));
  });
async function mount(ownerId = "A", enable = true) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <ProfileOverview
          userId={ownerId}
          showRemindersOptIn={enable}
          remindersSyntheticTransport={transport}
        />
      </QueryClientProvider>,
    ),
  );
  await pause();
}
async function click(label: string) {
  const b = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (x) => x.textContent?.trim() === label,
  );
  expect(b, label).toBeDefined();
  await act(async () => b?.click());
  await pause();
}
async function type(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>("#" + id);
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function form() {
  const f = host.querySelector('form[aria-label="Создать напоминание"]');
  expect(f).not.toBeNull();
  await act(async () =>
    f?.dispatchEvent(
      new Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await pause();
}
async function open() {
  await mount();
  await click("Напоминания о тренировках (макет)");
  await click("Добавить напоминание (макет)");
}
async function createAttempt() {
  await open();
  await type("reminder-create-name", " Вечером ");
  await form();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "ownerA", role: "USER" });
  list = vi.fn(async () => []);
  create = vi.fn(async () => ({ httpStatus: 200, success: true, data: success }));
  lookup = vi.fn(async () => ({
    httpStatus: 200,
    success: true,
    data: {
      status: "COMMITTED",
      reminder: success,
    },
  }));
  legacyCreate = vi.fn(async () => ({ httpStatus: 201, success: true, data: success }));
  transport = {
    fixtureKind: "AG2_REMINDER_SETTINGS_SYNTHETIC_ONLY",
    list,
    update: vi.fn(async () => ({ httpStatus: 200, success: true })),
    create: legacyCreate,
    v2: { fixtureKind: REMINDER_V2_FIXTURE, create, lookup, journal: makeReminderV2Journal() },
  };
  fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url !== "/api/v1/user/profile" || init.method !== "GET")
      throw Error("NETWORK_WRITE_FORBIDDEN");
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: "A",
          username: "ownerA",
          email: "PRIVATE_EMAIL",
          token: "SECRET_TOKEN",
          profile: { fullName: "Владелец", city: "Самара", about: "Собаки" },
        },
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.unstubAllGlobals();
});
describe("AG2 current existing Web RemindersOptIn V2 HTTP header candidate source/mock", () => {
  it("RV201 exact HTTP header UUIDv4, canonical four-field payload, no G05 key", async () => {
    await createAttempt();
    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0]?.[0];
    expect(request).toMatchObject({ ownerId: "A", method: "POST", path: "/api/v1/reminders" });
    const key = request?.headers["Idempotency-Key"] ?? "";
    expect(key).toMatch(uuid);
    expect(Object.keys(request?.body ?? {}).sort()).toEqual([
      "name",
      "reminderDays",
      "reminderTime",
      "timezone",
    ]);
    expect(request?.body).toEqual({
      name: "Вечером",
      reminderTime: "09:00",
      reminderDays: null,
      timezone: "UTC",
    });
    expect(JSON.stringify(request)).not.toMatch(/clientRequestId|PRIVATE_|SECRET_|token/);
    expect(legacyCreate).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Только синтетический ACK V2");
  });
  it("RV202 remount after ACK preserves operation identity, never second POST", async () => {
    await createAttempt();
    const id = create.mock.calls[0][0].headers["Idempotency-Key"];
    await click("К списку напоминаний");
    await act(async () => root.render(<div>Маршрут закрыт</div>));
    await pause();
    await mount();
    await click("Напоминания о тренировках (макет)");
    expect(host.textContent).toContain("Только синтетический ACK V2");
    expect(host.textContent).not.toContain("Создать (макет)");
    expect(create).toHaveBeenCalledTimes(1);
    expect(transport.v2?.journal.read("A")?.idempotencyKey).toBe(id);
    expect(transport.v2?.journal.read("A")?.body).toEqual(create.mock.calls[0][0].body);
  });
  it("RV203 thrown lostACK -> UNKNOWN, remount manual owner lookup only", async () => {
    create.mockRejectedValueOnce(Error("SECRET_LOST_ACK"));
    await createAttempt();
    expect(host.textContent).toContain("Результат операции V2 неизвестен");
    const id = create.mock.calls[0][0].headers["Idempotency-Key"];
    await act(async () => root.render(<div>Unmount</div>));
    await pause();
    await mount();
    await click("Напоминания о тренировках (макет)");
    expect(host.textContent).toContain("Результат операции V2 неизвестен");
    await click("Проверить операцию у владельца (макет)");
    expect(lookup).toHaveBeenCalledExactlyOnceWith({
      ownerId: "A",
      method: "GET",
      path: "/api/v1/reminders/operations/" + id,
    });
    expect(host.textContent).toContain("COMMITTED подтверждён только синтетическим GET");
    expect(create).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("SECRET_LOST_ACK");
  });
  it("RV204 400 REMINDER_LIMIT_REACHED is terminal rejected, no lookup", async () => {
    create.mockResolvedValueOnce({
      httpStatus: 400,
      success: false,
      code: "REMINDER_LIMIT_REACHED",
      error: "SECRET_CAP",
    });
    await createAttempt();
    expect(host.textContent).toContain("Достигнут лимит");
    expect(host.textContent).not.toContain("Результат операции V2 неизвестен");
    expect(host.innerHTML).not.toContain("SECRET_CAP");
    expect(host.textContent).not.toContain("Проверить операцию");
    await click("К списку напоминаний");
    expect(create).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("RV205 409 REMINDER_IDEMPOTENCY_CONFLICT terminal, no lookup/retry", async () => {
    create.mockResolvedValueOnce({
      httpStatus: 409,
      success: false,
      code: "REMINDER_IDEMPOTENCY_CONFLICT",
    });
    await createAttempt();
    expect(host.textContent).toContain("Конфликт ключа операции (409)");
    expect(host.textContent).not.toContain("Проверить операцию");
    expect(create).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("RV206 409 REMINDER_OPERATION_UNKNOWN allows only manual GET", async () => {
    create.mockResolvedValueOnce({
      httpStatus: 409,
      success: false,
      code: "REMINDER_OPERATION_UNKNOWN",
    });
    lookup.mockResolvedValueOnce({
      httpStatus: 404,
      success: false,
      code: "REMINDER_OPERATION_UNKNOWN",
    });
    await createAttempt();
    await click("Проверить операцию у владельца (макет)");
    expect(host.textContent).toContain("Создание не подтверждено");
    expect(host.textContent).not.toContain("Проверить операцию у владельца");
    expect(create).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it("RV207 valid-looking 201 is not approved keyed ACK, lookup required", async () => {
    create.mockResolvedValueOnce({ httpStatus: 201, success: true, data: success });
    await createAttempt();
    expect(host.textContent).toContain("Результат операции V2 неизвестен");
    expect(host.textContent).not.toContain("синтетический ACK V2");
  });
  it("RV215 actual ApiError typed 400 CAP remains rejected", async () => {
    create.mockRejectedValueOnce(new ApiError(400, "PRIVATE_CAP_ERROR", "REMINDER_LIMIT_REACHED"));
    await createAttempt();
    expect(host.textContent).toContain("Достигнут лимит");
    expect(host.innerHTML).not.toContain("PRIVATE_CAP_ERROR");
    expect(lookup).not.toHaveBeenCalled();
  });
  it("RV216 actual ApiError typed 409 conflict terminal", async () => {
    create.mockRejectedValueOnce(
      new ApiError(409, "PRIVATE_CONFLICT", "REMINDER_IDEMPOTENCY_CONFLICT"),
    );
    await createAttempt();
    expect(host.textContent).toContain("Конфликт ключа операции (409)");
    expect(host.innerHTML).not.toContain("PRIVATE_CONFLICT");
    expect(lookup).not.toHaveBeenCalled();
  });
  it("RV208 duplicate submit before settle sends exactly one POST", async () => {
    const wait = defer();
    create.mockReturnValueOnce(wait.promise);
    await open();
    await type("reminder-create-name", "Вечером");
    const f = host.querySelector("form")!;
    await act(async () => {
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => wait.resolve({ httpStatus: 200, success: true, data: success }));
    await pause();
    expect(host.textContent).toContain("Только синтетический ACK V2");
  });
  it("RV209 late A->B->A on pending POST hides draft/ACK, never lookup", async () => {
    const wait = defer();
    create.mockReturnValueOnce(wait.promise);
    await open();
    await type("reminder-create-name", "PRIVATE_DRAFT");
    await form();
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B", username: "other", role: "USER" }),
    );
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "ownerA", role: "USER" }),
    );
    await act(async () =>
      wait.resolve({
        httpStatus: 200,
        success: true,
        data: {
          ...success,
          name: "PRIVATE_DRAFT",
        },
      }),
    );
    await pause();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("PRIVATE_DRAFT");
    expect(host.textContent).not.toContain("синтетический ACK V2");
    expect(create).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("RV210 same id but new sessionRevision must fence V2", async () => {
    await open();
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, {
        id: "A",
        username: "ownerA",
        role: "USER",
        sessionRevision: "new-session",
      }),
    );
    expect(host.textContent).toContain("Сессия изменилась");
    expect(create).not.toHaveBeenCalled();
  });
  it("RV211 other owner cannot read journal or resolve A's operation", async () => {
    await createAttempt();
    expect(transport.v2?.journal.read("B")).toBeNull();
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, {
        id: "B",
        username: "ownerB",
        role: "USER",
      }),
    );
    await mount("B");
    expect(host.textContent).not.toContain("Вечером");
    expect(lookup).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("RV212 no V2 fixture defaults to existing one-shot 201 legacy create", async () => {
    delete transport.v2;
    await createAttempt();
    expect(create).not.toHaveBeenCalled();
    expect(legacyCreate).toHaveBeenCalledTimes(1);
    expect(legacyCreate.mock.calls[0][0]).not.toHaveProperty("headers");
    expect(host.textContent).toContain("Только синтетический ACK создания");
  });
  it("RV213 no any fixture or v2 cannot show V2 form", async () => {
    delete transport.create;
    delete transport.v2;
    await mount();
    await click("Напоминания о тренировках (макет)");
    expect(host.textContent).not.toContain("Добавить напоминание");
    expect(create).not.toHaveBeenCalled();
  });
  it("RV214 full reload without injected memory journal never resends old POST automatically", async () => {
    create.mockRejectedValueOnce(Error("LOST_ACK"));
    await createAttempt();
    const oldKey = create.mock.calls[0][0].headers["Idempotency-Key"];
    // Simulate new JS instance by supplying a NEW clean in-memory journal.
    transport.v2!.journal = makeReminderV2Journal();
    await act(async () => root.render(<div>Full reload without persistent secret</div>));
    await pause();
    await mount();
    await click("Напоминания о тренировках (макет)");
    expect(create).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
    expect(transport.v2!.journal.read("A")).toBeNull();
    expect(host.innerHTML).not.toContain(oldKey);
  });
});

describe("AG4 Web V2 durable UNKNOWN injected CAS actual existing form", () => {
  const psn = "psn_mockowner_pseudonym_aaaa00001111";
  const epoch = "epoch_mocksession_abc1234";
  const setup = (storage: DurableCASStore = makeReminderV2FakeAsyncCAS()) => {
    transport.v2!.durable = makeReminderV2DurableMock({
      store: storage,
      ownerScope: psn,
      authEpoch: epoch,
    });
    return storage;
  };
  const reopen = async () => {
    transport.v2!.journal = makeReminderV2Journal();
    await act(async () => root.render(<div>Cold restart</div>));
    await pause();
    await mount();
    await click("Напоминания о тренировках (макет)");
  };
  it("RV2D01 PREPARED and MAY_HAVE_SENT durably stored before only POST", async () => {
    const db = setup();
    create.mockImplementationOnce(async () => {
      const value = (await db.read()) as DurableMarker;
      expect(value.phase).toBe("MAY_HAVE_SENT");
      expect(Object.keys(value).sort()).toEqual(
        [
          "schemaVersion",
          "ownerScope",
          "authEpoch",
          "operationKey",
          "phase",
          "createdAt",
          "lastSeenAt",
        ].sort(),
      );
      return { httpStatus: 200, success: true, data: success };
    });
    await createAttempt();
    expect(create).toHaveBeenCalledTimes(1);
    expect(((await db.read()) as DurableMarker).phase).toBe("COMMITTED");
    expect(JSON.stringify(await db.read())).not.toMatch(
      /Вечером|name|reminderTime|timezone|clientRequestId|PRIVATE_|SECRET_/,
    );
  });
  it("RV2D02 crash MID POST restores UNKNOWN without network; manual GET200", async () => {
    const db = setup();
    const d = defer();
    create.mockReturnValueOnce(d.promise);
    await open();
    await type("reminder-create-name", "Вечером");
    await form();
    expect(((await db.read()) as DurableMarker).phase).toBe("MAY_HAVE_SENT");
    expect(create).toHaveBeenCalledTimes(1);
    const sent = create.mock.calls[0][0].headers["Idempotency-Key"];
    await reopen();
    expect(host.textContent).toContain("Результат операции V2 неизвестен");
    expect(host.textContent).not.toContain("Создать (макет)");
    expect(create).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
    await click("Проверить операцию у владельца (макет)");
    expect(lookup).toHaveBeenCalledExactlyOnceWith({
      ownerId: "A",
      method: "GET",
      path: "/api/v1/reminders/operations/" + sent,
    });
    expect(host.textContent).toContain("Исходные поля после перезапуска не сверены");
    expect(((await db.read()) as DurableMarker).phase).toBe("SERVER_COMMITTED_UNVERIFIED_DRAFT");
    expect(host.textContent).not.toContain("EXACT_CONFIRMED");
    await act(async () => d.resolve({ httpStatus: 200, success: true, data: success }));
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("RV2D11 cold reload SERVER_COMMITTED_UNVERIFIED_DRAFT stays terminal without GET", async () => {
    const db = setup();
    create.mockRejectedValueOnce(Error("LOST_ACK"));
    await createAttempt();
    await reopen();
    await click("Проверить операцию у владельца (макет)");
    expect(((await db.read()) as DurableMarker).phase).toBe("SERVER_COMMITTED_UNVERIFIED_DRAFT");
    await reopen();
    expect(host.textContent).toContain("Исходные поля после перезапуска не сверены");
    expect(host.textContent).not.toContain("Проверить операцию у владельца");
    expect(host.textContent).not.toContain("EXACT_CONFIRMED");
    expect(create).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it("RV2D03 PREPARED after crash is UNKNOWN, no automatic POST or lookup", async () => {
    const db = setup();
    const ctrl = transport.v2!.durable!;
    const key = "f003b513-ae45-4f09-92db-0f4874b67e81";
    expect((await ctrl.reserve(key))?.phase).toBe("PREPARED");
    await mount();
    await click("Напоминания о тренировках (макет)");
    expect(host.textContent).toContain("Результат операции V2 неизвестен");
    expect(create).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(((await db.read()) as DurableMarker).phase).toBe("PREPARED");
  });
  it("RV2D04 manual GET404 remains UNKNOWN and cannot authorize new key", async () => {
    const db = setup();
    create.mockRejectedValueOnce(Error("LOST_ACK_PRIVATE"));
    await createAttempt();
    await reopen();
    lookup.mockResolvedValueOnce({
      httpStatus: 404,
      success: false,
      code: "REMINDER_OPERATION_UNKNOWN",
      error: "SECRET_RAW_BACKEND",
    });
    await click("Проверить операцию у владельца (макет)");
    expect(host.textContent).toContain("Создание не подтверждено");
    expect(host.innerHTML).not.toContain("SECRET_RAW_BACKEND");
    expect(create).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(((await db.read()) as DurableMarker).phase).toBe("UNKNOWN");
    await reopen();
    expect(host.textContent).not.toContain("Создать (макет)");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("RV2D05 failed storage read during hydration blocks create entirely", async () => {
    const db: DurableCASStore = {
      read: vi.fn(async () => {
        throw Error("SECRET_STORAGE_FAULT");
      }),
      compareAndSwap: vi.fn(async () => true),
    };
    setup(db);
    await mount();
    await click("Напоминания о тренировках (макет)");
    expect(host.textContent).toContain("Новое создание заблокировано");
    expect(host.textContent).not.toContain("Добавить напоминание (макет)");
    expect(host.innerHTML).not.toContain("SECRET_STORAGE_FAULT");
    expect(create).not.toHaveBeenCalled();
    expect(db.compareAndSwap).not.toHaveBeenCalled();
  });
  it("RV2D06 denied write before POST yields UNKNOWN but NO POST", async () => {
    setup({ read: async () => null, compareAndSwap: async () => false });
    await createAttempt();
    expect(host.textContent).toContain("POST не отправлен");
    expect(host.textContent).not.toContain("Проверить операцию у владельца");
    expect(create).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });
  it("RV2D07 after reserve, transition fault blocks synthetic POST", async () => {
    const base = makeReminderV2FakeAsyncCAS();
    let cas = 0;
    const db: DurableCASStore = {
      read: () => base.read(),
      compareAndSwap: async (old, next) => {
        cas++;
        if (cas === 2) return false;
        return base.compareAndSwap(old, next);
      },
    };
    setup(db);
    await createAttempt();
    expect(create).not.toHaveBeenCalled();
    expect(((await base.read()) as DurableMarker).phase).toBe("PREPARED");
    expect(host.textContent).toContain("Результат операции V2 неизвестен");
  });
  it("RV2D08 A->B->A late ACK never replaces owner fence", async () => {
    const db = setup();
    const d = defer();
    create.mockReturnValueOnce(d.promise);
    await open();
    await type("reminder-create-name", "PRIVATE_DRAFT");
    await form();
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "B", username: "ownerB", role: "USER" }),
    );
    await act(async () =>
      cache.setQueryData(CURRENT_USER_QUERY_KEY, { id: "A", username: "ownerA", role: "USER" }),
    );
    await act(async () =>
      d.resolve({
        httpStatus: 200,
        success: true,
        data: {
          ...success,
          name: "PRIVATE_DRAFT",
        },
      }),
    );
    await pause();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("PRIVATE_DRAFT");
    expect(((await db.read()) as DurableMarker).phase).toBe("MAY_HAVE_SENT");
    expect(lookup).not.toHaveBeenCalled();
  });
  it("RV2D09 owner/epoch mismatch quarantines marker without new POST", async () => {
    const db = setup();
    create.mockRejectedValueOnce(Error("LOST_ACK"));
    await createAttempt();
    transport.v2!.journal = makeReminderV2Journal();
    transport.v2!.durable = makeReminderV2DurableMock({
      store: db,
      ownerScope: psn,
      authEpoch: "epoch_other_session_aaaa",
    });
    await act(async () => root.render(<div>Logout and login new epoch</div>));
    await pause();
    await mount();
    await click("Напоминания о тренировках (макет)");
    expect(host.textContent).toContain("Новое создание заблокировано");
    expect(host.innerHTML).not.toContain("f003b513");
    expect(lookup).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("RV2D10 malformed restored marker blocks create without data leaks", async () => {
    const db = makeReminderV2FakeAsyncCAS({
      schemaVersion: 999,
      secret: "PRIVATE_DRAFT",
    });
    setup(db);
    await mount();
    await click("Напоминания о тренировках (макет)");
    expect(host.textContent).toContain("Новое создание заблокировано");
    expect(host.innerHTML).not.toContain("PRIVATE_DRAFT");
    expect(create).not.toHaveBeenCalled();
  });
});
