// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "test-user" } } }),
}));
vi.mock("next/dynamic", () => ({
  default: () => () => <div>Общий чат загружен</div>,
}));
vi.mock("./ChatLoader", () => ({
  default: () => <div>Личный чат загружен</div>,
}));
vi.mock("./ChatDialogs", () => ({
  default: () => <div>Чаты тренера загружены</div>,
}));
vi.mock("@/shared/components/ui", () => ({
  PrimaryButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button data-shared-button="primary" {...props}>{children}</button>
  ),
  SecondaryButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button data-shared-button="secondary" {...props}>{children}</button>
  ),
  LoadingState: () => null,
}));

import ChatHub from "./ChatHub";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function tabs() {
  const personal = host.querySelector<HTMLButtonElement>("#chat-personal-tab");
  const community = host.querySelector<HTMLButtonElement>("#chat-community-tab");
  if (!personal || !community) throw new Error("Chat tabs are missing");
  return { personal, community };
}

describe("ChatHub shared design-system tabs", () => {
  it("uses primary for the active chat and secondary for the inactive chat", async () => {
    await act(async () => root.render(<ChatHub />));

    let { personal, community } = tabs();
    expect(personal.getAttribute("data-shared-button")).toBe("primary");
    expect(community.getAttribute("data-shared-button")).toBe("secondary");
    expect(personal.getAttribute("aria-selected")).toBe("true");
    expect(community.tabIndex).toBe(-1);
    expect(host.textContent).toContain("Личный чат загружен");

    await act(async () => community.click());
    ({ personal, community } = tabs());
    expect(personal.getAttribute("data-shared-button")).toBe("secondary");
    expect(community.getAttribute("data-shared-button")).toBe("primary");
    expect(community.getAttribute("aria-selected")).toBe("true");
    expect(community.tabIndex).toBe(0);
    expect(document.activeElement).toBe(community);
    expect(host.textContent).toContain("Общий чат загружен");
  });

  it("keeps keyboard navigation and active focus when switching tabs", async () => {
    await act(async () => root.render(<ChatHub initialCommunity />));
    expect(tabs().community.getAttribute("data-shared-button")).toBe("primary");

    await act(async () => {
      tabs().community.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }),
      );
    });
    expect(tabs().personal.getAttribute("aria-selected")).toBe("true");
    expect(tabs().personal.getAttribute("data-shared-button")).toBe("primary");
    expect(document.activeElement).toBe(tabs().personal);
  });
});
