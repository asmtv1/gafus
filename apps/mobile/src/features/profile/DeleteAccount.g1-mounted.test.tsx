// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  owner: "A", username: "ownerA", epoch: "E1", authenticated: true,
  loading: false, profilePending: false, profileError: false,
  profile: { id: "A", email: "owner@example.test" } as { id: string; email: string | null },
  queries: [] as { queryKey: unknown[]; queryFn: () => Promise<unknown>; enabled: boolean }[],
  request: vi.fn(), remove: vi.fn(), getProfile: vi.fn(), logout: vi.fn(),
  haptic: vi.fn(), trace: vi.fn(), push: vi.fn(), open: vi.fn(),
}));
vi.mock("@/shared/stores", () => {
  const state = () => ({
    user: m.authenticated ? { id: m.owner, username: m.username } : null,
    isAuthenticated: m.authenticated, isLoading: m.loading,
    logout: (...args: unknown[]) => m.logout(...args),
  });
  return { useAuthStore: Object.assign(
    (selector: (value: unknown) => unknown) => selector(state()),
    { getState: state },
  ) };
});
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => m.authenticated ?
      { principalId: m.owner, authEpoch: m.epoch } : null,
  },
}));
vi.mock("@/shared/lib/api/user", () => ({
  userApi: {
    requestAccountDeletionCode: (...args: unknown[]) => m.request(...args),
    deleteAccount: (...args: unknown[]) => m.remove(...args),
    getProfile: (...args: unknown[]) => m.getProfile(...args),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.trace(...args),
}));
vi.mock("@/shared/lib/utils/haptics", () => ({
  hapticFeedback: { success: () => m.haptic() },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (value: { queryKey: unknown[]; queryFn: () => Promise<unknown>; enabled: boolean }) => {
    m.queries.push(value);
    return { data: m.profile, isPending: m.profilePending, isError: m.profileError };
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => m.push(...args) }),
}));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/config", () => ({
  BORDER_RADIUS: { lg: 8 },
  COLORS: { background: "white", surface: "white", border: "gray", error: "red",
    text: "black", textSecondary: "gray", primary: "olive", secondary: "olive" },
  SPACING: { sm: 8, lg: 16, md: 12, xl: 24, xs: 4 },
}));
vi.mock("@/shared/components", async () => {
  const R = await import("react");
  return { TexturedSafeAreaView: ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children) };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    ScrollView: Box, View: Box,
    StyleSheet: { create: (x: unknown) => x },
    Linking: { openURL: (...args: unknown[]) => m.open(...args) },
    Pressable: ({ children, onPress, accessibilityRole, accessibilityState }: {
      children?: React.ReactNode; onPress?: () => void; accessibilityRole?: string;
      accessibilityState?: { checked?: boolean },
    }) => R.createElement("button", { onClick: onPress, role: accessibilityRole,
      "aria-checked": accessibilityState?.checked }, children),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return { Text: ({ children, accessibilityRole }: {
    children?: React.ReactNode; accessibilityRole?: string,
  }) => R.createElement("span", { role: accessibilityRole }, children) };
});
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  const Card = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  Object.assign(Card, { Content: Card });
  return {
    Card,
    Button: ({ label, onPress, disabled }: {
      label: string; onPress: () => void; disabled?: boolean,
    }) => R.createElement("button", { onClick: onPress, disabled }, label),
    Input: ({ label, value, onChangeText }: {
      label: string; value: string; onChangeText: (value: string) => void,
    }) => R.createElement("input", { "aria-label": label, value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText(e.target.value) }),
  };
});

import DeleteAccountScreen from "../../../app/(main)/profile/delete-account";
let host: HTMLDivElement, root: Root;
function button(label: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find(b => b.textContent?.includes(label));
}
async function click(label: string) { await act(async()=>button(label)?.click()); }
async function fill(label: string, value: string) {
  const input=host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(input).not.toBeNull();
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(input,value);
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
}
async function render() { await act(async()=>root.render(createElement(DeleteAccountScreen))); }
async function requestCode() { await click("Отправить код на email"); }
async function review() {
  await requestCode();await fill("Код из письма","123456");await click("Продолжить");
}
async function confirm() {
  await fill("Введите логин для подтверждения","ownerA");
  await click("Я понимаю, что восстановить аккаунт невозможно.");
}
const hold=<T,>()=>{
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(yes=>{resolve=yes;});
  return {promise,resolve};
};
beforeEach(()=>{
  vi.clearAllMocks();
  m.owner="A";m.username="ownerA";m.epoch="E1";
  m.authenticated=true;m.loading=false;m.profilePending=false;m.profileError=false;
  m.profile={id:"A",email:"owner@example.test"};m.queries=[];
  m.request.mockResolvedValue({success:true});
  m.remove.mockResolvedValue({success:true});
  m.getProfile.mockResolvedValue({success:true,data:m.profile});
  m.logout.mockResolvedValue(undefined);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT=true;
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});

describe("AG2 original Next six-digit account deletion — Mobile mounted SOURCE only",()=>{
  it("does not send deletion before code, typed login and explicit acknowledgement",async()=>{
    await render();expect(m.remove).not.toHaveBeenCalled();
    await requestCode();
    expect(m.request).toHaveBeenCalledOnce();
    expect(m.request.mock.calls[0][0]).toEqual(expect.any(Function));
    expect(button("Удалить навсегда")).toBeUndefined();
    await fill("Код из письма","12345");
    expect(button("Продолжить")?.disabled).toBe(true);
    await fill("Код из письма","123456");await click("Продолжить");
    expect(button("Удалить навсегда")?.disabled).toBe(true);
    await fill("Введите логин для подтверждения","someone-else");
    await click("Я понимаю, что восстановить аккаунт невозможно.");
    expect(button("Удалить навсегда")?.disabled).toBe(true);
    await fill("Введите логин для подтверждения","ownerA");
    expect(button("Удалить навсегда")?.disabled).toBe(false);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("accepts confirmed delete once and clears current account using established logout",async()=>{
    await render();await review();await confirm();
    await act(async()=>{button("Удалить навсегда")?.click();button("Удалить навсегда")?.click();});
    expect(m.remove).toHaveBeenCalledOnce();
    expect(m.remove.mock.calls[0][0]).toBe("123456");
    expect(m.remove.mock.calls[0][1]).toEqual(expect.any(Function));
    expect(m.logout).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Удаление подтверждено сервером");
    expect(button("Удалить навсегда")).toBeUndefined();
  });
  it("lost deletion ACK cannot trigger retry or success and never leaks private errors",async()=>{
    m.remove.mockRejectedValue(Error("PRIVATE_SERVER_ACCOUNT_DELETED_OR_NOT"));
    await render();await review();await confirm();await click("Удалить навсегда");
    expect(m.remove).toHaveBeenCalledOnce();
    expect(m.logout).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Результат удаления неизвестен");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_ACCOUNT_DELETED_OR_NOT");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_SERVER_ACCOUNT_DELETED_OR_NOT");
    await click("Удалить навсегда");expect(m.remove).toHaveBeenCalledOnce();
  });
  it("a definitive bad code resets confirmation and permits new explicit code",async()=>{
    m.remove.mockResolvedValueOnce({success:false,error:"Неверный или просроченный код"});
    await render();await review();await confirm();await click("Удалить навсегда");
    expect(m.remove).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Неверный или просроченный код");
    expect(button("Продолжить")?.disabled).toBe(true);
    await fill("Код из письма","777777");await click("Продолжить");await confirm();
    await click("Удалить навсегда");expect(m.remove).toHaveBeenCalledTimes(2);
  });
  it("code request singleflight and unknown ACK block duplicate mail",async()=>{
    const p=hold<{success:boolean}>();m.request.mockReturnValueOnce(p.promise);
    await render();
    await act(async()=>{button("Отправить код на email")?.click();
      button("Отправить код на email")?.click();});
    expect(m.request).toHaveBeenCalledOnce();
    await act(async()=>p.resolve({success:false}));
    expect(host.textContent).toContain("Результат запроса кода неизвестен");
    expect(button("Отправить код на email")).toBeUndefined();
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("actor epoch changes before an ACK block all stale deletion effects",async()=>{
    const p=hold<{success:boolean}>();m.request.mockReturnValueOnce(p.promise);
    await render();
    await act(async()=>button("Отправить код на email")?.click());
    m.owner="B";m.username="ownerB";m.epoch="E2";
    m.profile={id:"B",email:"ownerB@example.test"};
    await render();
    await act(async()=>p.resolve({success:true}));
    expect(m.request).toHaveBeenCalledOnce();
    expect(m.remove).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Код отправлен");
  });
  it("late profile GET cannot cache former principal or start request for new owner",async()=>{
    await render();
    const opts=m.queries[0];expect(opts.enabled).toBe(true);
    expect(opts.queryKey).toEqual(["user-profile","account-delete","A","E1"]);
    const p=hold<{success:boolean;data:{id:string;email:string|null}}>();
    m.getProfile.mockReturnValueOnce(p.promise);
    const pending=opts.queryFn();
    const outcome=expect(pending).rejects.toThrow("ACCOUNT_OWNER_CHANGED");
    m.owner="B";m.epoch="E2";
    await act(async()=>p.resolve({success:true,data:{id:"A",email:"PRIVATE_OLD"}}));
    await outcome;
    expect(m.request).not.toHaveBeenCalled();
  });
  it("old actor's late confirmed delete does not log out a new session",async()=>{
    const late=hold<{success:boolean}>();m.remove.mockReturnValueOnce(late.promise);
    await render();await review();await confirm();
    await act(async()=>button("Удалить навсегда")?.click());
    expect(m.remove).toHaveBeenCalledOnce();
    m.owner="B";m.username="ownerB";m.epoch="E2";
    m.profile={id:"B",email:"ownerB@example.test"};
    await render();
    await act(async()=>late.resolve({success:true}));
    expect(m.logout).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Удаление подтверждено сервером");
    expect(m.remove).toHaveBeenCalledOnce();
  });
  it("a backend 500 or unknown delete status is never treated as rejected invalid code",async()=>{
    m.remove.mockResolvedValueOnce({success:false,code:"INTERNAL",error:"Private backend failure"});
    await render();await review();await confirm();await click("Удалить навсегда");
    expect(m.remove).toHaveBeenCalledOnce();
    expect(m.logout).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Результат удаления неизвестен");
    expect(host.textContent).not.toContain("Private backend failure");
    expect(button("Продолжить")).toBeUndefined();
  });
  it("lost code request ACK sanitizes telemetry and leaves email re-send blocked",async()=>{
    m.request.mockRejectedValueOnce(Error("PRIVATE_MAIL_PROVIDER_DETAILS"));
    await render();await requestCode();
    expect(m.request).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Результат запроса кода неизвестен");
    expect(host.textContent).not.toContain("PRIVATE_MAIL_PROVIDER_DETAILS");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_MAIL_PROVIDER_DETAILS");
    expect(button("Отправить код на email")).toBeUndefined();
  });
  it("no email or unverified authentication cannot request deletion code",async()=>{
    m.profile={id:"A",email:null};await render();
    expect(host.textContent).toContain("Сначала укажите email");
    await click("Указать email");expect(m.push).toHaveBeenCalledWith("/profile/change-email");
    expect(m.request).not.toHaveBeenCalled();
    m.authenticated=false;await render();
    expect(host.textContent).toContain("Сессия изменилась или не подтверждена");
    expect(m.request).not.toHaveBeenCalled();
  });
});
