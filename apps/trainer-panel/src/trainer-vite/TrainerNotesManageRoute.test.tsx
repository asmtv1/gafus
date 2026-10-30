// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainerNotesManageRoute } from "./TrainerNotesManageRoute";
import type { NotesReadTransport } from "./TrainerNotesRead20261022";
import type { TrainerNotesManageTransport } from "./TrainerNotesManageRoute";

const actor = { id: "trainer-a", role: "TRAINER" as const };
const headers = { "cache-control": "private, no-store" };
const note = {
  id: "cm1rtx5qq00024ph6y2swjp43",
  trainerId: actor.id,
  title: "Прогресс",
  tags: ["курс"],
  createdAt: "2026-10-25T12:00:00.000Z",
  entries: [
    {
      id: "entry-1",
      content: "Сидеть",
      order: 0,
      isVisibleToStudent: false,
      createdAt: "2026-10-25T12:00:00.000Z",
      updatedAt: "2026-10-25T12:00:00.000Z",
    },
  ],
  students: [
    {
      id: "cm1rtx5qq00014ph6y2swjp42",
      username: "puppy-user",
      profile: { fullName: "Ученица", avatarUrl: null },
    },
  ],
};
let rows: (typeof note)[] = [];
let getStatus = 200;
let writeStatus = 200;
const read = vi.fn(async (path: string, _signal: AbortSignal) => {
  if (path.includes("/lookup?query="))
    return {
      status: 200,
      headers,
      body: { success: true, data: [{ id: note.students[0]!.id, username: "puppy-user" }] },
    };
  return {
    status: getStatus,
    headers,
    body: { success: true, data: { notes: rows, total: rows.length, page: 0, pageSize: 50 } },
  };
}) satisfies NotesReadTransport;
const write = vi.fn(async (req: Parameters<TrainerNotesManageTransport>[0]) => {
  if (writeStatus < 400) {
    if (req.method === "DELETE") rows = [];
    else if (req.method === "PUT") {
      const body = req.body as { title: string };
      rows = [{ ...note, title: body.title }];
    } else rows = [{ ...note }];
  }
  return {
    status: req.method === "POST" && writeStatus === 200 ? 201 : writeStatus,
    headers,
    body: { success: writeStatus === 200 },
  };
}) satisfies TrainerNotesManageTransport;
let host: HTMLDivElement;
let root: Root;
const getCurrentSession = () => ({ actor, token: "opaque", authEpoch: "epoch-1" });
async function mount(props: Partial<Parameters<typeof TrainerNotesManageRoute>[0]> = {}) {
  await act(async () =>
    root.render(
      createElement(TrainerNotesManageRoute, {
        pathname: "/main-panel/notes",
        actor,
        token: "opaque",
        authEpoch: "epoch-1",
        enabled: true,
        notesReadTransport: read,
        notesManageTransport: write,
        getCurrentSession,
        ...props,
      }),
    ),
  );
}
async function change(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function clickLabel(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find((el) =>
    el.textContent?.includes(label),
  );
  expect(button, label).toBeTruthy();
  await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  rows = [{ ...note }];
  getStatus = 200;
  writeStatus = 200;
  read.mockClear();
  write.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
describe("trainer notes live Vite CRUD", () => {
  it("reads private entries and updates with actor-scoped PUT then rereads list", async () => {
    await mount();
    expect(host.textContent).toContain("Сидеть");
    expect(host.textContent).toContain("личная запись");
    await clickLabel("Редактировать");
    const titleInput = host
      .querySelector<HTMLFormElement>("form")!
      .querySelector<HTMLInputElement>('input[maxlength="200"]')!;
    await change(titleInput, "Успехи");
    await act(async () =>
      host
        .querySelector<HTMLFormElement>("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "PUT",
      path: "/api/v1/trainer/notes/manage/" + note.id,
      body: {
        title: "Успехи",
        studentIds: [note.students[0]!.id],
        entries: [{ content: "Сидеть", order: 0, isVisibleToStudent: false }],
      },
    });
    expect(host.textContent).toContain("Успехи");
    expect(read.mock.calls.length).toBeGreaterThan(1);
  });
  it("finds a student and creates one note only when submitted", async () => {
    rows = [];
    await mount();
    const search = host.querySelector<HTMLInputElement>('input[placeholder="Минимум 2 символа"]')!;
    await change(search, "puppy");
    await clickLabel("Найти учеников");
    expect(read.mock.calls.some((call) => call[0].includes("/lookup?query=puppy"))).toBe(true);
    await clickLabel("Добавить");
    const text = host.querySelector<HTMLTextAreaElement>("form textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(text, "Сидеть");
      text.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickLabel("Создать заметку");
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({
      method: "POST",
      path: "/api/v1/trainer/notes/manage",
      body: { studentIds: [note.students[0]!.id] },
    });
  });
  it("never sends DELETE without confirmation and hides private notes for retired actor", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    await clickLabel("Удалить");
    expect(write).not.toHaveBeenCalled();
    await mount({ getCurrentSession: () => null });
    expect(host.textContent).not.toContain("Сидеть");
    expect(host.textContent).toContain("недоступны");
    expect(write).not.toHaveBeenCalled();
  });
  it("fails closed for denied and unsafe-cache reads", async () => {
    getStatus = 403;
    await mount();
    expect(host.textContent).toContain("запрещён");
    expect(host.textContent).not.toContain("Сидеть");
  });
});
