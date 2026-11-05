// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children, onLayout, testID }: {
    children: React.ReactNode; onLayout?: () => void; testID?: string;
  }) => <div data-testid={testID} onClick={() => onLayout?.()}>{children}</div>,
  Image: ({ onLoad }: { onLoad?: () => void }) =>
    <button type="button" data-testid="startup-bitmap-loaded"
      onClick={(event) => { event.stopPropagation(); onLoad?.(); }}>loaded</button>,
  StyleSheet: {
    absoluteFillObject: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
    create: <T,>(value: T): T => value,
  },
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));

import { StartupLoader } from "./StartupLoader";

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("Android native splash handoff", () => {
  it("does not dismiss the system screen before both poster decode and layout", async () => {
    const rootElement = document.createElement("div");
    document.body.appendChild(rootElement);
    const root = createRoot(rootElement);
    const onReady = vi.fn();
    await act(async () => { root.render(<StartupLoader overlay onReady={onReady} />); });
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      rootElement.querySelector<HTMLButtonElement>("[data-testid=startup-bitmap-loaded]")!.click();
    });
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      rootElement.querySelector<HTMLElement>("[data-testid=startup-splash]")!.click();
    });
    expect(onReady).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
  it("waits for poster decode even if its fullscreen view was laid out earlier", async () => {
    const rootElement = document.createElement("div");
    document.body.appendChild(rootElement);
    const root = createRoot(rootElement);
    const onReady = vi.fn();
    await act(async () => { root.render(<StartupLoader overlay onReady={onReady} />); });
    await act(async () => {
      rootElement.querySelector<HTMLElement>("[data-testid=startup-splash]")!.click();
    });
    expect(onReady).not.toHaveBeenCalled();
    await act(async () => {
      rootElement.querySelector<HTMLButtonElement>("[data-testid=startup-bitmap-loaded]")!.click();
    });
    expect(onReady).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
