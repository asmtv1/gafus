// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/shared/lib/api/auth";

interface Session {
  isLoading: boolean;
  isAuthenticated: boolean;
  verifiedSessionEpoch: string | null;
  user: Pick<User, "role"> | null;
}

const mocks = vi.hoisted(() => ({
  state: {
    isLoading: true,
    isAuthenticated: false,
    verifiedSessionEpoch: null,
    user: null,
  } as Session,
  listeners: new Set<() => void>(),
  prevent: vi.fn((_key: string) => Promise.resolve()),
  allow: vi.fn((_key: string) => Promise.resolve()),
  report: vi.fn(),
}));

vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: (selector: (session: Session) => boolean) =>
    useSyncExternalStore(
      (listener) => {
        mocks.listeners.add(listener);
        return () => { mocks.listeners.delete(listener); };
      },
      () => selector(mocks.state),
    ),
}));
vi.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: mocks.prevent,
  allowScreenCaptureAsync: mocks.allow,
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: mocks.report }));

import { useRoleAwareScreenCapture } from "./useRoleAwareScreenCapture";

function CapturePolicyHost() {
  useRoleAwareScreenCapture();
  return null;
}

let root: Root;
let container: HTMLDivElement;
const key = "gafus-global-screen-protection";

async function updateSession(state: Partial<Session>) {
  await act(async () => {
    mocks.state = { ...mocks.state, ...state };
    for (const listener of mocks.listeners) listener();
  });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.state = {
    isLoading: true,
    isAuthenticated: false,
    verifiedSessionEpoch: null,
    user: null,
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(CapturePolicyHost)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  mocks.listeners.clear();
});

describe("native role-aware screen capture", () => {
  it("protects startup and cached admin identity until server session verification", async () => {
    expect(mocks.prevent).toHaveBeenCalledWith(key);
    expect(mocks.allow).not.toHaveBeenCalled();

    await updateSession({ isLoading: false, isAuthenticated: true, user: { role: "ADMIN" } });
    expect(mocks.allow).not.toHaveBeenCalled();

    await updateSession({ verifiedSessionEpoch: "server-verified" });
    expect(mocks.allow).toHaveBeenCalledWith(key);

    await updateSession({ isAuthenticated: false, verifiedSessionEpoch: null });
    expect(mocks.prevent).toHaveBeenCalledTimes(2);
  });

  it("immediately reapplies the restriction after a role downgrade or account switch", async () => {
    await updateSession({
      isLoading: false,
      isAuthenticated: true,
      verifiedSessionEpoch: "server-verified",
      user: { role: "PARTNER" },
    });
    expect(mocks.allow).toHaveBeenCalledWith(key);

    await updateSession({ user: { role: "USER" } });
    expect(mocks.prevent).toHaveBeenCalledTimes(2);

    await updateSession({ user: { role: "TRAINER" } });
    expect(mocks.allow).toHaveBeenCalledTimes(2);

    await updateSession({ user: { role: "MODERATOR" } });
    expect(mocks.prevent).toHaveBeenCalledTimes(3);
  });

  it("serializes native calls so a pending allow cannot overtake a logout restriction", async () => {
    let resolveAllow: (() => void) | undefined;
    mocks.allow.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveAllow = resolve;
    }));

    await updateSession({
      isLoading: false,
      isAuthenticated: true,
      verifiedSessionEpoch: "server-verified",
      user: { role: "ADMIN" },
    });
    expect(mocks.allow).toHaveBeenCalledTimes(1);

    await updateSession({ isAuthenticated: false, verifiedSessionEpoch: null });
    // The revoke is queued behind the outstanding native allow, never reordered.
    expect(mocks.prevent).toHaveBeenCalledTimes(1);

    await act(async () => resolveAllow?.());
    expect(mocks.prevent).toHaveBeenCalledTimes(2);
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
