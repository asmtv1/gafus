// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "E1",
  authed: true,
  petId: "pet-X",
  get: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  setTarget: vi.fn(),
  tracer: vi.fn(),
  alert: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: m.authed,
      isLoading: false,
      user: m.authed ? { id: m.owner } : null,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => (m.authed ? { principalId: m.owner, authEpoch: m.epoch } : null),
  },
}));
vi.mock("@/shared/lib/api/pets", () => ({
  petWeightApi: {
    get: (...a: unknown[]) => m.get(...a),
    add: (...a: unknown[]) => m.add(...a),
    remove: (...a: unknown[]) => m.remove(...a),
    setTarget: (...a: unknown[]) => m.setTarget(...a),
  },
}));
vi.mock("@/shared/lib/tracer", () => ({ reportClientError: (...a: unknown[]) => m.tracer(...a) }));
vi.mock("@/shared/config", () => ({
  COLORS: {
    text: "#242",
    textSecondary: "#777",
    primary: "#565",
    primaryDark: "#353",
    onPrimary: "white",
    cardBackground: "beige",
    error: "red",
  },
  FONTS: { montserrat: "A", montserratBold: "A", montserratMedium: "A" },
}));
vi.mock("react-native", async () => {
  const R = await import("react");
  const Box = ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
  }) => R.createElement("div", props, children);
  return {
    View: Box,
    Alert: { alert: (...args: unknown[]) => m.alert(...args) },
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
    }) =>
      R.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
    TextInput: ({
      value, placeholder, onChangeText,
    }: {
      value?: string; placeholder?: string; onChangeText?: (next: string) => void;
    }) => R.createElement("input", {
      value, placeholder,
      onInput: (event: { currentTarget: { value: string } }) =>
        onChangeText?.(event.currentTarget.value),
    }),
  };
});
vi.mock("react-native-paper", async () => {
  const R = await import("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => R.createElement("span", null, children),
  };
});
vi.mock("react-native-svg", async () => {
  const R = await import("react");
  const Svg = ({
    children,
    accessibilityLabel,
  }: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
  }) => R.createElement("svg", { "aria-label": accessibilityLabel }, children);
  const Line = (props: Record<string, unknown>) => R.createElement("line", props);
  const Circle = (props: Record<string, unknown>) => R.createElement("circle", props);
  const Polyline = (props: Record<string, unknown>) => R.createElement("polyline", props);
  const SvgText = ({ children }: { children?: React.ReactNode }) =>
    R.createElement("text", null, children);
  return { default: Svg, Line, Circle, Polyline, Text: SvgText };
});
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
vi.mock("@/shared/components/ui/Button", async () => {
  const R = await import("react");
  return {
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
      R.createElement("button", { onClick: onPress }, label),
  };
});
import { PetWeightSection } from "./PetWeightSection";
let host: HTMLDivElement, root: Root, queryClient: QueryClient;
const history = (entries: unknown[] = [], additional: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    currentWeightKg: entries.length ? (entries.at(-1) as { weightKg: number }).weightKg : null,
    targetWeightKg: null,
    entries,
    ...additional,
  },
});
const entry = (
  id: string,
  weightKg: number,
  measuredAt: string,
  createdAt = measuredAt,
  petId = m.petId,
  ownerId = m.owner,
) => ({
  id,
  petId,
  ownerId,
  weightKg,
  measuredAt,
  createdAt,
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
};
async function mount() {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(PetWeightSection, { petId: m.petId }),
      ),
    ),
  );
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("__DEV__", false);
  m.owner = "A";
  m.epoch = "E1";
  m.authed = true;
  m.petId = "pet-X";
  m.get.mockReset().mockResolvedValue(history());
  m.add.mockReset();
  m.remove.mockReset();
  m.setTarget.mockReset();
  m.tracer.mockReset();
  m.alert.mockReset();
  m.remove.mockResolvedValue({ success: true });
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  host.remove();
});
describe("AG3 V98 mounted PetWeightSection existing GET history presentation", () => {
  it("guest zero GET and zero old cached private weight", async () => {
    m.authed = false;
    queryClient.setQueryData(
      ["pet-weight", "pet-X"],
      history([entry("old", 180, "2026-06-02T10:00:00.000Z")]),
    );
    await mount();
    expect(m.get).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("180 кг");
  });
  it("pending GET shows loading, not false empty or private weight", async () => {
    const gate = deferred<ReturnType<typeof history>>();
    m.get.mockReturnValueOnce(gate.promise);
    await mount();
    expect(host.textContent).toContain("Загрузка веса");
    expect(host.textContent).not.toContain("За этот период измерений нет");
    await act(async () => gate.resolve(history([entry("w1", 12.3, "2026-06-02T10:00:00.000Z")])));
    await vi.waitFor(() => expect(host.textContent).toContain("12,3 кг"));
  });
  it("own 200 ascending measuredAt then createdAt produces chronological polyline and latest kg", async () => {
    m.get.mockResolvedValueOnce(
      history(
        [
          entry("mid", 12.2, "2026-08-01T12:00:00.000Z", "2026-08-01T13:00:00.000Z"),
          entry("first", 11.1, "2026-06-01T12:00:00.000Z"),
          entry("last", 13.4, "2026-09-01T12:00:00.000Z"),
        ],
        { currentWeightKg: 13.4, targetWeightKg: 14 },
      ),
    );
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("13,4 кг"));
    expect(host.querySelector('svg[aria-label="График веса: 3 измерений"]')).not.toBeNull();
    expect(host.querySelector("polyline")?.getAttribute("points")?.split(" ")).toHaveLength(3);
    expect(host.textContent).toContain("До цели 0,6 кг");
    const text = host.textContent ?? "";
    expect(text.indexOf("13,4 кг")).toBeLessThan(text.lastIndexOf("12,2 кг"));
    expect(m.get).toHaveBeenCalledTimes(1);
    expect(m.get.mock.calls[0][0]).toBe("pet-X");
    expect(typeof m.get.mock.calls[0][1]).toBe("function");
  });
  it("same measuredAt entries sort by Core createdAt ASC; list newest first and stays in kg", async () => {
    const date = "2026-08-10T12:00:00.000Z";
    m.get.mockResolvedValueOnce(
      history(
        [
          entry("later", 15.4, date, "2026-08-10T13:00:00.000Z"),
          entry("earlier", 13.6, date, "2026-08-10T12:30:00.000Z"),
        ],
        { currentWeightKg: 15.4 },
      ),
    );
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("15,4 кг"));
    expect(host.textContent?.lastIndexOf("15,4 кг")).toBeLessThan(
      host.textContent?.lastIndexOf("13,6 кг") ?? 0,
    );
    expect(host.querySelector('svg[aria-label="График веса: 2 измерений"]')).not.toBeNull();
  });
  it("own valid empty200 shows empty, no error, chart hidden", async () => {
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("За этот период измерений нет"));
    expect(host.textContent).not.toContain("Не удалось загрузить вес");
    expect(host.querySelector("svg")).toBeNull();
  });
  it("malformed200 is error with manual retry not fake empty", async () => {
    m.get
      .mockResolvedValueOnce({
        success: true,
        data: {
          entries: [{ id: "a", weightKg: "PRIVATE_170", measuredAt: "bad" }],
          targetWeightKg: "bad",
        },
      })
      .mockResolvedValueOnce(history([entry("fresh", 12, "2026-08-02T10:00:00.000Z")]));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить вес"));
    expect(host.textContent).not.toContain("PRIVATE_170");
    expect(host.textContent).not.toContain("За этот период измерений нет");
    const retry = Array.from(host.querySelectorAll("button")).find((x) =>
      x.textContent?.includes("повторить"),
    );
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.click();
      retry?.click();
    });
    await vi.waitFor(() => expect(host.textContent).toContain("12 кг"));
    expect(m.get).toHaveBeenCalledTimes(2);
  });
  it("known404/500/UNKNOWN never falsely show empty", async () => {
    m.get.mockResolvedValueOnce({ success: false, error: "Питомец не найден" });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить вес"));
    expect(host.textContent).not.toContain("За этот период измерений нет");
  });
  it("pet X→Y→X: delayed previous X cannot update new X and Y is never reused", async () => {
    const old = deferred<ReturnType<typeof history>>();
    m.get
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(
        history([
          entry("Y", 25.1, "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", "pet-Y"),
        ]),
      )
      .mockResolvedValueOnce(history([entry("X2", 15.5, "2026-09-01T00:00:00.000Z")]));
    await mount();
    m.petId = "pet-Y";
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("25,1 кг"));
    m.petId = "pet-X";
    await mount();
    await act(async () => old.resolve(history([entry("OLD", 180, "2026-07-01T00:00:00.000Z")])));
    await vi.waitFor(() => expect(host.textContent).toContain("15,5 кг"));
    expect(host.textContent).not.toContain("180 кг");
  });
  it("same pet A→B→A new epoch fences old private cached A and old late GET", async () => {
    const old = deferred<ReturnType<typeof history>>();
    m.get
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(
        history([
          entry("B", 20, "2026-06-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z", "pet-X", "B"),
        ]),
      )
      .mockResolvedValueOnce(history([entry("A2", 14, "2026-09-01T00:00:00.000Z")]));
    await mount();
    m.owner = "B";
    m.epoch = "B1";
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("20 кг"));
    m.owner = "A";
    m.epoch = "E2";
    await mount();
    await act(async () => old.resolve(history([entry("A1", 180, "2026-05-01T00:00:00.000Z")])));
    await vi.waitFor(() => expect(host.textContent).toContain("14 кг"));
    expect(host.textContent).not.toContain("180 кг");
  });
  it("forged cache stamped as current actor but carrying another owner cannot render", async () => {
    queryClient.setQueryData(["pet-weight", "pet-X", "A", "E1"], {
      __weightOwnerId: "A",
      __weightEpoch: "E1",
      __weightPetId: "pet-X",
      currentWeightKg: 180,
      targetWeightKg: null,
      entries: [
        entry("forged", 180, "2026-06-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z", "pet-X", "B"),
      ],
    });
    const gate = deferred<ReturnType<typeof history>>();
    m.get.mockReturnValueOnce(gate.promise);
    await mount();
    expect(host.textContent).not.toContain("180 кг");
    await act(async () =>
      gate.resolve(history([entry("owner", 13.25, "2026-09-01T00:00:00.000Z")])),
    );
    await vi.waitFor(() => expect(host.textContent).toContain("13,25 кг"));
    expect(host.textContent).not.toContain("180 кг");
    expect(m.tracer.mock.calls.flat().some((x) => String(x).includes("PRIVATE"))).toBe(false);
  });
  it.each(["INTERNAL_SERVER_ERROR", "RATE_LIMITED", "UNKNOWN"])(
    "%s read error never becomes empty or private backend text",
    async (code) => {
      m.get.mockResolvedValueOnce({ success: false, code, error: "PRIVATE_BACKEND_DIAG" });
      await mount();
      await vi.waitFor(() => expect(host.textContent).toContain("Не удалось загрузить вес"));
      expect(host.textContent).not.toContain("За этот период измерений нет");
      expect(host.textContent).not.toContain("PRIVATE_BACKEND_DIAG");
    },
  );
  it("foreign cached data cannot render even while refreshing same pet", async () => {
    queryClient.setQueryData(["pet-weight", "pet-X"], {
      entries: [entry("foreign", 180, "2026-06-01T00:00:00.000Z")],
      targetWeightKg: null,
      currentWeightKg: 180,
    });
    const gate = deferred<ReturnType<typeof history>>();
    m.get.mockReturnValueOnce(gate.promise);
    await mount();
    expect(host.textContent).not.toContain("180 кг");
    await act(async () => gate.resolve(history([])));
    await vi.waitFor(() => expect(host.textContent).toContain("За этот период измерений нет"));
  });
  it("unmount pending GET cannot paint private late result or mutate", async () => {
    const gate = deferred<ReturnType<typeof history>>();
    m.get.mockReturnValueOnce(gate.promise);
    await mount();
    await act(async () => root.unmount());
    await act(async () => gate.resolve(history([entry("late", 180, "2026-06-01T00:00:00.000Z")])));
    expect(host.textContent).not.toContain("180 кг");
    expect(m.add).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.setTarget).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});


describe("MOBILE_PET_WEIGHT_ORIGINAL_DELETE_OWNER_ACK", () => {
  async function prepareRemove() {
    m.get.mockResolvedValue(history([
      entry("w1", 13.4, "2026-09-01T12:00:00.000Z"),
    ]));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("13,4 кг"));
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label^="Удалить измерение от "]',
    );
    expect(trigger).not.toBeNull();
    await act(async () => trigger?.click());
    expect(m.alert).toHaveBeenCalledTimes(1);
    const actions = m.alert.mock.calls[0][2] as {
      text: string; onPress?: () => void;
    }[];
    const confirm = actions.find(x => x.text === "Удалить")?.onPress;
    expect(confirm).toBeDefined();
    return confirm!;
  }
  it("does not send DELETE from a confirmation belonging to a retired owner", async () => {
    const confirm = await prepareRemove();
    m.owner = "B";
    m.epoch = "E2";
    await mount();
    await act(async () => confirm());
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("resolved 404 denial neither invalidates cache nor leaks backend private error", async () => {
    m.remove.mockResolvedValue({ success: false, error: "PRIVATE_OWNER_TOKEN_404" });
    const confirm = await prepareRemove();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await act(async () => confirm());
    await vi.waitFor(() => expect(m.remove).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось"));
    expect(invalidate).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("PRIVATE_OWNER_TOKEN");
    expect(JSON.stringify(m.tracer.mock.calls)).not.toContain("PRIVATE_OWNER_TOKEN");
  });
  it("unknown transport failure does not leak sensitive backend exception", async () => {
    m.remove.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_SECRET"));
    const confirm = await prepareRemove();
    await act(async () => confirm());
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось"));
    expect(host.textContent).not.toContain("PRIVATE_DATABASE_SECRET");
    expect(JSON.stringify(m.tracer.mock.calls)).not.toContain("PRIVATE_DATABASE_SECRET");
  });
  it("double destructive confirmation while request is pending sends exactly one DELETE", async () => {
    const pending = deferred<{success: boolean}>();
    m.remove.mockReturnValueOnce(pending.promise);
    const confirm = await prepareRemove();
    await act(async () => { confirm();confirm(); });
    expect(m.remove).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({success: true}));
    await vi.waitFor(() => expect(m.remove).toHaveBeenCalledTimes(1));
  });
  it("late old-owner DELETE ACK after A→B→A never refreshes another session", async () => {
    const pending = deferred<{success: boolean}>();
    m.remove.mockReturnValueOnce(pending.promise);
    const confirm = await prepareRemove();
    await act(async () => confirm());
    expect(m.remove).toHaveBeenCalledTimes(1);
    m.owner = "B";
    m.epoch = "B1";
    await mount();
    m.owner = "A";
    m.epoch = "E2";
    await mount();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await act(async () => pending.resolve({success: true}));
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("confirmed success=true invalidates owner history and pet list without replay", async () => {
    const confirm = await prepareRemove();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await act(async () => confirm());
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["pet-weight", "pet-X", "A", "E1"],
    }));
    expect(invalidate).toHaveBeenCalledWith({queryKey: ["pets"]});
    expect(m.remove).toHaveBeenCalledWith("pet-X", "w1", expect.any(Function));
    expect(m.remove.mock.calls[0][2]()).toBe(true);
  });
});

describe("USER020 original weight add/goal write -> owner GET readback in mounted card", () => {
  async function openButton(label: string) {
    const button = Array.from(host.querySelectorAll("button"))
      .find(node => node.textContent === label);
    expect(button).toBeDefined();
    await act(async () => button?.click());
  }
  async function enter(placeholder: string, value: string) {
    const input = Array.from(host.querySelectorAll("input"))
      .find(node => node.getAttribute("placeholder") === placeholder);
    expect(input).toBeDefined();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      set?.call(input, value);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  it("rejects invalid kg locally then adds corrected decimal kg and displays only refreshed GET result", async () => {
    const old = entry("before", 13.4, "2026-09-01T12:00:00.000Z");
    const newer = entry("after", 14.6, new Date().toISOString());
    m.get.mockResolvedValueOnce(history([old])).mockResolvedValue(history([old, newer]));
    m.add.mockResolvedValue({ success: true, data: newer });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("13,4 кг"));
    await openButton("Записать вес");
    await enter("Например, 24,3", "300");
    await openButton("Сохранить");
    expect(host.textContent).toContain("Проверьте вес и дату измерения");
    expect(m.add).not.toHaveBeenCalled();
    await enter("Например, 24,3", "14,6");
    await openButton("Сохранить");
    await vi.waitFor(() => expect(m.add).toHaveBeenCalledTimes(1));
    const [petId, kg, date] = m.add.mock.calls[0];
    expect(petId).toBe("pet-X");
    expect(kg).toBe(14.6);
    expect(Number.isNaN(new Date(date as string).getTime())).toBe(false);
    expect(m.add.mock.calls[0][3]()).toBe(true);
    await vi.waitFor(() => expect(m.get).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(host.textContent).toContain("14,6 кг"));
    expect(m.add).toHaveBeenCalledTimes(1);
  });
  it("explicit POST rejection keeps input available; correction uses a new request, not automatic replay", async () => {
    const old = entry("before", 13.4, "2026-09-01T12:00:00.000Z");
    const newer = entry("after", 15.2, new Date().toISOString());
    m.get.mockResolvedValueOnce(history([old])).mockResolvedValue(history([old, newer]));
    m.add.mockResolvedValueOnce({
      success: false, code: "INVALID_VALUE", error: "PRIVATE_OTHER_OWNER_VALUE",
    }).mockResolvedValueOnce({ success: true, data: newer });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("13,4 кг"));
    await openButton("Записать вес");
    await enter("Например, 24,3", "14");
    await openButton("Сохранить");
    await vi.waitFor(() => expect(host.textContent).toContain("Не удалось сохранить данные"));
    expect(host.textContent).not.toContain("PRIVATE_OTHER_OWNER_VALUE");
    expect(m.add).toHaveBeenCalledTimes(1);
    expect(m.get).toHaveBeenCalledTimes(1);
    await enter("Например, 24,3", "15,2");
    await openButton("Сохранить");
    await vi.waitFor(() => expect(m.add).toHaveBeenCalledTimes(2));
    expect(m.add.mock.calls[1][1]).toBe(15.2);
    await vi.waitFor(() => expect(host.textContent).toContain("15,2 кг"));
  });
  it("set and clear target weight use original PUT, display only server-refreshed target", async () => {
    const old = entry("before", 13.4, "2026-09-01T12:00:00.000Z");
    m.get.mockResolvedValueOnce(history([old]))
      .mockResolvedValueOnce(history([old], { targetWeightKg: 12 }))
      .mockResolvedValue(history([old], { targetWeightKg: null }));
    m.setTarget.mockResolvedValue({ success: true });
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("13,4 кг"));
    await openButton("Цель");
    await enter("Оставьте пустым, чтобы убрать цель", "12");
    await openButton("Сохранить цель");
    await vi.waitFor(() => expect(m.setTarget).toHaveBeenCalledWith(
      "pet-X", 12, expect.any(Function),
    ));
    await vi.waitFor(() => expect(host.textContent).toContain("До цели"));
    expect(m.setTarget).toHaveBeenCalledTimes(1);
    await openButton("Цель");
    await enter("Оставьте пустым, чтобы убрать цель", "");
    await openButton("Сохранить цель");
    await vi.waitFor(() => expect(m.setTarget).toHaveBeenCalledWith(
      "pet-X", null, expect.any(Function),
    ));
    await vi.waitFor(() => expect(m.get).toHaveBeenCalledTimes(3));
    expect(host.textContent).not.toContain("До цели");
  });
  it("pending add ACK retired by actor rotation never updates the new pet list", async () => {
    const pending = deferred<{ success: boolean }>();
    m.add.mockReturnValueOnce(pending.promise);
    m.get.mockResolvedValue(history([entry("before", 13.4, "2026-09-01T12:00:00.000Z")]));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain("13,4 кг"));
    await openButton("Записать вес");
    await enter("Например, 24,3", "14,6");
    await openButton("Сохранить");
    expect(m.add).toHaveBeenCalledTimes(1);
    m.owner = "B";m.epoch = "B1";
    await mount();
    m.owner = "A";m.epoch = "E2";
    await mount();
    const invalidated = vi.spyOn(queryClient, "invalidateQueries");
    await act(async () => pending.resolve({ success: true }));
    expect(invalidated).not.toHaveBeenCalled();
  });
});
