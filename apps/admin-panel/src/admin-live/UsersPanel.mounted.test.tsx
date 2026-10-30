// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsersPanel } from "./UserManagement";

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./api", () => ({
  requestAdmin: mock.request,
  AdminHttpError: class AdminHttpError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  },
}));
const record = {
  id: "user123", username: "dogowner", email: "dog@example.test", phone: null,
  role: "USER", registrationChannel: "WEB", createdAt: "2026-10-21T09:00:00Z",
  profile: { fullName: "Хозяин собаки", avatarUrl: null },
  savedRegistrationPromoCode: null, partnerProfile: null,
  _count: { pushSubscriptions: 0 },
};
const source = { users: [record], freePartnerPromoCodes: [] };
let host: HTMLDivElement, root: Root, saved: ReturnType<typeof vi.fn<() => void>>;
async function mount() {
  await act(async () => root.render(
    <UsersPanel source={source} actorRole="ADMIN" actorId="admin1" onSaved={saved} />,
  ));
}
function actionButton(text: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find((node) => node.textContent?.trim() === text);
}
async function press(text: string) {
  const btn = actionButton(text);
  expect(btn).toBeDefined();
  await act(async () => btn?.click());
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  saved = vi.fn();
  mock.request.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("prompt", vi.fn(() => "dogowner"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals();
});

describe("Admin /users: ambiguous writes cannot be blindly repeated", () => {
  it("restores Next ?search direct URL on /users without a private API side effect", async () => {
    window.history.replaceState(null, "", "/main-panel/users?search=dogowner");
    await mount();
    expect(host.querySelector<HTMLInputElement>('input[placeholder="Имя, почта, ID, промокод"]')?.value)
      .toBe("dogowner");
    expect(host.textContent).toContain("@dogowner");
    expect(mock.request).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "/main-panel/users");
  });

  it("DELETE transport failure is unknown, locks further deletion and requires fresh GET", async () => {
    mock.request.mockRejectedValueOnce(new Error("Lost HTTP ACK"));
    await mount(); await press("Удалить");
    expect(mock.request).toHaveBeenCalledExactlyOnceWith("/api/v1/admin/users/user123", {
      method: "DELETE",
    });
    expect(host.textContent).toContain("Удаление могло выполниться");
    expect(actionButton("Удалить")?.disabled).toBe(true);
    await press("Удалить");
    expect(mock.request).toHaveBeenCalledTimes(1);
    await press("Перечитать список пользователей");
    expect(saved).toHaveBeenCalledTimes(1);
    expect(globalThis.confirm).toHaveBeenCalledTimes(1);
  });
  it("PATCH unknown ACK locks form until server reload; never retries", async () => {
    mock.request.mockRejectedValueOnce(new Error("Network dropped"));
    await mount(); await press("Изменить");
    const editor = host.querySelector<HTMLElement>(".user-editor");
    expect(editor).not.toBeNull();
    const roleSelect = [...(editor?.querySelectorAll("select") ?? [])]
      .find((select) => select.querySelector('option[value="TRAINER"]'));
    expect(roleSelect).toBeDefined();
    await act(async () => {
      if (roleSelect) {
        roleSelect.value = "TRAINER";
        roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    const form = editor?.querySelector("form");
    expect(form).not.toBeNull();
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mock.request).toHaveBeenCalledExactlyOnceWith("/api/v1/admin/users/user123", {
      method: "PATCH", body: { role: "TRAINER" },
    });
    expect(host.textContent).toContain("Ответ на изменение пользователя неизвестен");
    expect(actionButton("Сохранить")?.disabled).toBe(true);
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mock.request).toHaveBeenCalledTimes(1);
    await press("Проверить пользователя на сервере");
    expect(saved).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".user-editor")).toBeNull();
  });
});
