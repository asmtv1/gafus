// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ types: vi.fn(), meta: vi.fn(), push: vi.fn(), trace: vi.fn() }));
vi.mock("@/shared/lib/offline", () => ({
  getOfflineCourseTypes: (...a: unknown[]) => m.types(...a),
  getCourseMeta: (...a: unknown[]) => m.meta(...a),
}));
vi.mock("@/shared/lib/offline/offlineStorage", () => ({
  assertSafeOfflineSegment: (s: string) => {
    if (!s || s === ".." || ["/", "\\", "%", "?", "#"].some((part) => s.includes(part)))
      throw Error("unsafe");
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.trace(...a) }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: (...a: unknown[]) => m.push(...a) }) }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/config", () => ({
  COLORS: {
    background: "white",
    primary: "olive",
    text: "black",
    textSecondary: "gray",
    disabled: "gray",
    cardBackground: "white",
    borderLight: "gray",
  },
  FONTS: { montserrat: "a", montserratMedium: "b", impact: "c" },
  SPACING: { md: 12, lg: 20, xs: 4, sm: 8 },
}));
vi.mock("@/shared/components/ui", async () => {
  const R = await import("react");
  return { Loading: () => R.createElement("div", null, "Загрузка списка...") };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
  };
});
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("div", null, children);
  return {
    View: Box,
    StyleSheet: { create: (v: unknown) => v },
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
    }) =>
      R.createElement("button", { "aria-label": accessibilityLabel, onClick: onPress }, children),
  };
});
import { OfflineDownloadedScreen } from "./OfflineDownloadedScreen";
let root: Root, host: HTMLDivElement;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
async function render() {
  await act(async () => root.render(createElement(OfflineDownloadedScreen)));
}
const btn = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
async function press(label: string) {
  await act(async () => btn(label)?.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  m.types.mockResolvedValue(["dog-basic", "obedience"]);
  m.meta.mockImplementation(async (type: string) => ({
    course: { name: type === "dog-basic" ? "Базовые навыки" : "Послушание" },
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("AG3 V64 actual offline downloaded list mounted UI", () => {
  it("first read shows loading until local storage resolves", async () => {
    const gate = deferred<string[]>();
    m.types.mockReturnValueOnce(gate.promise);
    await render();
    expect(host.textContent).toContain("Загрузка списка");
    await act(async () => gate.resolve(["dog-basic"]));
    expect(host.textContent).toContain("Базовые навыки");
  });
  it("stable saved list shows names from metadata and accessible course actions", async () => {
    await render();
    expect(host.textContent).toContain("Базовые навыки");
    expect(host.textContent).toContain("Послушание");
    await press("Открыть скачанный курс Базовые навыки");
    expect(m.push).toHaveBeenCalledWith("/training/dog-basic");
  });
  it("missing metadata uses course type rather than losing row", async () => {
    m.meta.mockResolvedValue(null);
    await render();
    expect(host.textContent).toContain("dog-basic");
    expect(host.textContent).toContain("obedience");
  });
  it("one rejected metadata read does not discard other downloaded course", async () => {
    m.meta.mockImplementation(async (type: string) => {
      if (type === "dog-basic") throw Error("PRIVATE_META_STACK");
      return { course: { name: "Послушание" } };
    });
    await render();
    expect(host.textContent).toContain("dog-basic");
    expect(host.textContent).toContain("Послушание");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_META_STACK");
  });
  it("duplicates and unsafe synthetic types are not navigable", async () => {
    m.types.mockResolvedValueOnce(["dog-basic", "dog-basic", "..", "bad/path", "name with space"]);
    await render();
    expect(btn("Открыть скачанный курс Базовые навыки")).not.toBeNull();
    expect(
      host.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Открыть скачанный курс Базовые навыки"]',
      ),
    ).toHaveLength(1);
    expect(host.textContent).not.toContain("bad/path");
    await press("Открыть скачанный курс Послушание");
    expect(m.push).toHaveBeenCalledWith("/training/name%20with%20space");
  });
  it("empty successful list shows empty state and manual reload action", async () => {
    m.types.mockResolvedValueOnce([]);
    await render();
    expect(host.textContent).toContain("Нет скачанных курсов");
    await press("Обновить скачанные курсы");
    expect(m.types).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Базовые навыки");
  });
  it("thrown storage list error is distinct from successful empty and retryable", async () => {
    m.types.mockRejectedValueOnce(Error("PRIVATE_LIST_STACK"));
    await render();
    expect(host.textContent).toContain("Не удалось прочитать список");
    expect(host.textContent).not.toContain("Нет скачанных курсов");
    expect(JSON.stringify(m.trace.mock.calls)).not.toContain("PRIVATE_LIST_STACK");
    await press("Обновить скачанные курсы");
    expect(host.textContent).toContain("Базовые навыки");
  });
  it("rapid doubletap reload is single-flight", async () => {
    await render();
    const gate = deferred<string[]>();
    m.types.mockReturnValueOnce(gate.promise);
    await act(async () => {
      btn("Обновить скачанные курсы")?.click();
      btn("Обновить скачанные курсы")?.click();
    });
    expect(m.types).toHaveBeenCalledTimes(2);
    await act(async () => gate.resolve(["obedience"]));
    expect(host.textContent).toContain("Послушание");
  });
  it("late metadata after unmount does not trigger navigation, error or publication", async () => {
    const gate = deferred<{ course: { name: string } }>();
    m.meta.mockReturnValueOnce(gate.promise);
    await render();
    await act(async () => root.unmount());
    await act(async () => gate.resolve({ course: { name: "PRIVATE_LATE_COURSE" } }));
    expect(m.trace).not.toHaveBeenCalled();
    expect(m.push).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
