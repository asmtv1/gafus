// @vitest-environment jsdom
/** AG4 source-only mounted Vite Trainer availability session and HTTP matrix. */
import { act } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Root } from "react-dom/client";
import { mountTrainerEntry } from "./mountTrainerEntry";
import type { PanelActor } from "./consultationContract";

const owner: PanelActor = { id: "trainer-a", role: "TRAINER" };
type Session = { actor: PanelActor; token: string | null; authEpoch?: string };
const current: Session = { actor: owner, token: "synthetic-jwt-a", authEpoch: "generation-a" };
const data = () => ({
  slotDurationMin: 30,
  rules: [{ id: "r1", weekday: 1, startTime: "09:00", endTime: "12:00", isWorkingDay: true }],
  dayOffs: [{ id: "off1", date: "2026-11-01", reason: "SYNTHETIC_PRIVATE_DAY_OFF" }],
  exceptions: [],
});
const result = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { "cache-control": "private, no-store" },
});
const ok = (body: unknown) => result(200, { success: true, data: body });
const denied = (status: number) => result(status, { success: false, error: "SYNTHETIC_DENIED" });
let element: HTMLDivElement;
let root: Root | null;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  element = document.createElement("div");
  document.body.append(element);
  root = null;
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  element.remove();
});
async function mount(fetchImpl: typeof fetch, get?: () => Session | null) {
  await act(async () => {
    root = mountTrainerEntry(element, {
      pathname: "/main-panel/consultations/availability",
      actor: owner,
      token: current.token,
      authEpoch: current.authEpoch,
      fetchImpl,
      getCurrentSession: get,
    });
  });
}
async function save() {
  const button = [...element.querySelectorAll("button")]
    .find(button => button.textContent === "Сохранить расписание");
  expect(button).toBeDefined();
  await act(async () => button?.click());
}
for (const status of [401, 403, 404, 409]) {
  it(`Trainer availability GET ${status} keeps private rules absent and has no retry`, async () => {
    const fetchImpl = vi.fn(async () => denied(status));
    await mount(fetchImpl);
    expect(element.textContent).toContain("Не удалось загрузить расписание");
    expect(element.textContent).not.toContain("SYNTHETIC_PRIVATE_DAY_OFF");
    expect(element.querySelectorAll("fieldset")).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/consultations/trainer/availability");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
  });
  it(`Trainer availability PUT ${status} becomes terminal UNKNOWN without resend`, async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PUT" ? denied(status) : ok(data()));
    await mount(fetchImpl);
    await save();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(element.textContent).not.toContain("Расписание подтверждено сервером");
    const alert = element.querySelector('[role="alert"]')?.textContent;
    expect(alert).toContain(status === 409 ? "Конфликт" : "неизвестен");
    await save();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/consultations/trainer/availability");
    expect(init.method).toBe("PUT");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(String(init.body))).toEqual({ rules: [{
      weekday: 1, startTime: "09:00", endTime: "12:00", isWorkingDay: true,
    }] });
  });
}
const changed: [string, Session | null][] = [
  ["logout", null],
  ["other owner", { actor: { id: "trainer-b", role: "TRAINER" },
    token: "synthetic-jwt-b", authEpoch: "generation-a" }],
  ["role downgrade", { actor: { id: "trainer-a", role: "USER" },
    token: current.token, authEpoch: "generation-a" }],
  ["generation change", { ...current, authEpoch: "generation-b" }],
  ["ABA restore new generation", { ...current, authEpoch: "generation-c" }],
];
for (const [label, replacement] of changed) {
  it(`Trainer availability late readback under ${label} never claims saved`, async () => {
    let live: Session | null = current;
    let release!: (res: Response) => void;
    let gets = 0;
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") return Promise.resolve(ok({}));
      if (++gets === 1) return Promise.resolve(ok(data()));
      return new Promise<Response>(resolve => { release = resolve; });
    });
    await mount(fetchImpl, () => live);
    await save();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    live = replacement;
    await act(async () => release(ok(data())));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(element.textContent).not.toContain("Расписание подтверждено сервером");
    expect(element.textContent).not.toContain("Результат сохранения неизвестен");
  });
}
it("Trainer availability: invalid DTO does not publish or permit PUT", async () => {
  const fetchImpl = vi.fn(async () => ok({ slotDurationMin: 30, rules: [] }));
  await mount(fetchImpl);
  expect(element.textContent).toContain("Не удалось загрузить расписание");
  expect(element.querySelectorAll("fieldset")).toHaveLength(0);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
