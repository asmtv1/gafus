// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
type MockProps = { children?: React.ReactNode; onPress?: () => void; disabled?: boolean; testID?: string; label?: string };
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  manual: undefined as string | undefined,
  read: vi.fn(), save: vi.fn(), track: vi.fn(), back: vi.fn(), replace: vi.fn(),
  canGoBack: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: mocks.back, replace: mocks.replace, canGoBack: mocks.canGoBack }),
  useLocalSearchParams: () => ({ manual: mocks.manual }),
  Redirect: ({ href }: { href: string }) => <div data-redirect={href} />,
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: (v: unknown) => v },
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Pressable: ({ children, onPress, disabled, testID }: MockProps) => <button data-testid={testID} disabled={disabled} onClick={onPress}>{children}</button>,
}));
vi.mock("react-native-paper", () => ({ Text: ({ children }: MockProps) => <span>{children}</span> }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, right: 0, bottom: 34, left: 0 }),
}));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@/shared/components", () => ({ TexturedSafeAreaView: ({ children }: MockProps) => <div>{children}</div> }));
vi.mock("@/shared/components/ui", () => ({ Button: ({ label, onPress, disabled }: MockProps) => <button onClick={onPress} disabled={disabled}>{label}</button> }));
vi.mock("@/shared/config", () => ({ COLORS: {}, FONTS: {}, SPACING: {} }));
vi.mock("@/shared/lib/mobile-intro-state", () => ({ readMobileIntroState: mocks.read, saveMobileIntroState: mocks.save }));
vi.mock("@/shared/lib/api/mobile-intro", () => ({ trackMobileIntroEvent: mocks.track }));
import IntroScreen from "../../../app/(auth)/intro";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks(); mocks.manual = undefined;
  mocks.read.mockResolvedValue({ index: 0, finished: false });
  mocks.save.mockResolvedValue(undefined); mocks.track.mockResolvedValue(undefined); mocks.canGoBack.mockReturnValue(true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render() { await act(async () => { root.render(<IntroScreen />); }); }
async function clickSlide(index: number) { await act(async () => { (container.querySelector(`[data-testid="mobile-intro-slide-${index}"]`) as HTMLButtonElement).click(); }); }
function button(text: string) { return Array.from(container.querySelectorAll("button")).find(b => b.textContent === text)!; }
describe("intro screen navigation", () => {
 it("resumes an unfinished slide and all six step buttons work", async () => {
  mocks.read.mockResolvedValue({ index: 2, finished: false }); await render();
  expect(container.textContent).toContain("3 из 6");
  for (const n of [1, 2, 3, 4, 5, 6, 1]) { await clickSlide(n); expect(container.textContent).toContain(`${n} из 6`); }
 });
 it("waits for saving before leaving and ignores repeated completion", async () => {
  let release!: () => void; mocks.save.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  mocks.read.mockResolvedValue({ index: 5, finished: false }); await render();
  await act(async () => { button("Перейти к приложению").click(); button("Перейти к приложению").click(); });
  expect(mocks.replace).not.toHaveBeenCalled(); expect(mocks.save).toHaveBeenCalledTimes(1);
  await act(async () => release());
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/welcome");
 });
 it("skip exits even on storage failure without unhandled rejection", async () => {
  mocks.save.mockRejectedValue(new Error("disk")); await render();
  await act(async () => button("Пропустить").click());
  expect(mocks.replace).toHaveBeenCalledWith("/welcome");
 });
 it("storage read failure still renders usable controls", async () => {
  mocks.read.mockRejectedValue(new Error("disk")); await render(); expect(button("Пропустить")).toBeTruthy();
 });
 it("completed deep links redirect instead of displaying a blank screen", async () => {
  mocks.read.mockResolvedValue({ index: 5, finished: true }); await render();
  expect(container.querySelector('[data-redirect="/welcome"]')).not.toBeNull();
 });
 it.each(["skip", "complete"])("manual %s returns to profile without changing the first-run state", async action => {
  mocks.manual = "1"; await render(); expect(container.textContent).toContain("1 из 6");
  if (action === "complete") await clickSlide(6);
  await act(async () => button(action === "complete" ? "Перейти к приложению" : "Пропустить").click());
  expect(mocks.back).toHaveBeenCalledTimes(1); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.track).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
 });
 it("manual deep link without history has a valid fallback", async () => {
  mocks.manual = "1"; mocks.canGoBack.mockReturnValue(false); await render();
  await act(async () => button("Пропустить").click()); expect(mocks.replace).toHaveBeenCalledWith("/");
 });
});
