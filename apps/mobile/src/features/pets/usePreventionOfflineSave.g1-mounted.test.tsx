// @vitest-environment jsdom
/** OFF021: mounted SCREEN-USED hook -> exact v2 writer -> durable storage -> restart read. */
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  createNewOnlyV2Queues,
  type NewOnlyV2Dependencies,
  type NewOnlyV2Queues,
} from "@/shared/lib/offline/newOnlyV2Queues";
import { enqueueNewOnlyPrevention } from "@/shared/lib/offline/newOnlyV2PreventionWriter";
import { readOwnPendingPrevention } from "@/shared/lib/offline/newOnlyV2PreventionPending";
import {
  usePreventionOfflineSave,
  type PreventionOfflineDependencies,
} from "./usePreventionOfflineSave";
import type { CreatePreventionEntryData } from "@/shared/lib/api/pets";
vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    View: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});
vi.mock("react-native-paper", () => ({ Text: "span" }));
import { PendingPreventionNotice } from "./PendingPreventionNotice";
import { PendingPreventionReadStatus } from "./PendingPreventionReadStatus";

vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: null }) },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({ newOnlyV2NativeQueues: {} }));
vi.mock("@/shared/lib/offline/newOnlyV2PreventionWriterNative", () => ({
  enqueueNewOnlyPreventionNative: vi.fn(),
}));

const dto: CreatePreventionEntryData = {
  type: "VACCINATION",
  performedAt: "2026-10-17",
  productName: "Тестовая вакцина",
  reminderEnabled: false,
  reminderKind: "AFTER_DAYS",
  reminderTimes: ["09:00"],
};
const LEGACY = {
  "prevention-sync-storage": "{historic-untouched-prevention}",
  "progress-sync-storage": "{historic-untouched-progress}",
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
function storageHarness() {
  const values = new Map<string, string>(Object.entries(LEGACY));
  const secrets = new Map<string, string>();
  const writes: string[] = [];
  let counter = 0;
  let failWrite = false;
  let failReadAfterWrite = false;
  let suspendedWrite: ReturnType<typeof deferred> | null = null;
  let enteredWrite: (() => void) | null = null;
  const entered = new Promise<void>((resolve) => {
    enteredWrite = resolve;
  });
  const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
  const dependencies: NewOnlyV2Dependencies = {
    storage: {
      getItem: async (key) => {
        if (failReadAfterWrite && key.startsWith("gafus-prevention-v2:") && writes.length > 0)
          throw new Error("STORAGE_READ_FAILED");
        return values.get(key) ?? null;
      },
      setItem: async (key, raw) => {
        if (failWrite) throw new Error("DISK_FULL");
        if (suspendedWrite) {
          enteredWrite?.();
          await suspendedWrite.promise;
        }
        writes.push(key);
        values.set(key, raw);
      },
    },
    secure: {
      getItemAsync: async (key) => secrets.get(key) ?? null,
      setItemAsync: async (key, raw) => {
        secrets.set(key, raw);
      },
      deleteItemAsync: async (key) => {
        secrets.delete(key);
      },
    },
    makeId: uuid,
    now: () => 1792252800000,
  };
  const store = createNewOnlyV2Queues(dependencies);
  let owner = "A";
  const injected: PreventionOfflineDependencies = {
    queue: store,
    enqueue: (petId, data) => enqueueNewOnlyPrevention(store, petId, data, uuid),
    currentOwner: () => owner,
  };
  return {
    store,
    injected,
    values,
    writes,
    entered,
    setOwner: (value: string) => {
      owner = value;
    },
    failWrites: () => {
      failWrite = true;
    },
    failReads: (value: boolean) => {
      failReadAfterWrite = value;
    },
    suspend: () => {
      suspendedWrite = deferred();
      return suspendedWrite;
    },
    newQueueAfterRestart: () => createNewOnlyV2Queues(dependencies),
    expectLegacyUnchanged: () => {
      for (const [key, raw] of Object.entries(LEGACY)) expect(values.get(key)).toBe(raw);
      expect(writes.every((key) => key.startsWith("gafus-prevention-v2:"))).toBe(true);
    },
  };
}
let element: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof usePreventionOfflineSave>;
let environment: ReturnType<typeof storageHarness>;
let saved: Mock<() => void>;
let failed: Mock<(error: Error) => void>;
function Harness({ petId = "pet-A", owner = "A" }: { petId?: string; owner?: string }) {
  current = usePreventionOfflineSave(petId, owner, environment.injected);
  return createElement(
    Fragment,
    null,
    createElement(PendingPreventionNotice, { entries: current.localPending }),
    createElement(PendingPreventionReadStatus, { status: current.pendingReadStatus }),
  );
}
async function render(owner = "A", petId = "pet-A") {
  await act(async () => {
    root.render(createElement(Harness, { petId, owner }));
  });
}
async function save(): Promise<void> {
  await current.save(dto, { onSaved: saved, onFailed: failed });
}
describe("OFF021 mounted offline pet prevention durable lifecycle", () => {
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    environment = storageHarness();
    await environment.store.beginVerifiedLogin("A");
    saved = vi.fn<() => void>();
    failed = vi.fn<(error: Error) => void>();
    element = document.createElement("div");
    document.body.appendChild(element);
    root = createRoot(element);
    await render();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
  });

  it("awaits durable storage + exact receipt read, then restores only A/epoch on restart", async () => {
    await act(async () => {
      await save();
    });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
    expect(current.localPending).toHaveLength(1);
    const id = current.localPending[0].eventId;
    expect(environment.writes).toHaveLength(1);
    const restart = environment.newQueueAfterRestart();
    expect(await restart.restoreVerifiedSession("A")).toBe(true);
    const restored = await readOwnPendingPrevention(restart, "pet-A", "A");
    expect(restored).toEqual([
      { eventId: id, type: "VACCINATION", performedAt: "2026-10-17T00:00:00.000Z" },
    ]);
    expect(await readOwnPendingPrevention(restart, "other-pet", "A")).toEqual([]);
    environment.expectLegacyUnchanged();
  });
  it("a verified restart remounts pending UI from durable v2 E1 without any new write", async () => {
    await act(async () => {
      await save();
    });
    const original = current.localPending[0].eventId;
    const writtenBefore = new Map(environment.values);
    await act(async () => root.unmount());
    root = createRoot(element);
    const restarted = environment.newQueueAfterRestart();
    expect(await restarted.restoreVerifiedSession("A")).toBe(true);
    environment.injected.queue = restarted;
    await render("A");
    expect(element.textContent).not.toContain("Прививка");
    await act(async () => {
      await current.refreshPending();
    });
    expect(current.localPending.map((row) => row.eventId)).toEqual([original]);
    expect(element.textContent).toContain("Прививка");
    expect(element.textContent).toContain("Сохранено только на этом устройстве · не отправлено");
    expect(environment.values).toEqual(writtenBefore);
    environment.expectLegacyUnchanged();
  });
  it("same A in a fresh verified epoch never inherits E1 UI or rewrites E1 bytes", async () => {
    await act(async () => {
      await save();
    });
    expect(element.textContent).toContain("Прививка");
    const epoch1 = environment.store.getVerifiedBinding()!.authEpoch;
    const oldKey = `gafus-prevention-v2:A:${epoch1}`;
    const oldBytes = environment.values.get(oldKey);
    await environment.store.endSession();
    await environment.store.beginVerifiedLogin("A");
    expect(environment.store.getVerifiedBinding()?.authEpoch).not.toBe(epoch1);
    await render("A");
    expect(current.localPending).toEqual([]);
    expect(element.textContent).not.toContain("Прививка");
    await act(async () => {
      await current.refreshPending();
    });
    expect(current.localPending).toEqual([]);
    expect(environment.values.get(oldKey)).toBe(oldBytes);
    expect(
      environment.values.has(
        `gafus-prevention-v2:A:${environment.store.getVerifiedBinding()!.authEpoch}`,
      ),
    ).toBe(false);
    environment.expectLegacyUnchanged();
  });
  it("A/E1 remains quarantined byte-exact while A/E2 writes and B login cannot read either epoch", async () => {
    await act(async () => {
      await save();
    });
    const epoch1 = environment.store.getVerifiedBinding()!.authEpoch;
    const key1 = `gafus-prevention-v2:A:${epoch1}`;
    const raw1 = environment.values.get(key1);
    const event1 = current.localPending[0].eventId;
    await environment.store.endSession();
    await environment.store.beginVerifiedLogin("A");
    const epoch2 = environment.store.getVerifiedBinding()!.authEpoch;
    expect(epoch2).not.toBe(epoch1);
    await render("A");
    await act(async () => {
      await current.refreshPending();
    });
    expect(current.localPending).toEqual([]);
    expect(element.textContent).not.toContain("Прививка");
    await act(async () => {
      await save();
    });
    const second = current.localPending[0].eventId;
    expect(second).not.toBe(event1);
    expect(environment.values.get(key1)).toBe(raw1);
    expect(environment.values.has(`gafus-prevention-v2:A:${epoch2}`)).toBe(true);
    const fresh = environment.newQueueAfterRestart();
    expect(await fresh.restoreVerifiedSession("A")).toBe(true);
    expect((await readOwnPendingPrevention(fresh, "pet-A", "A")).map((e) => e.eventId)).toEqual([
      second,
    ]);
    await environment.store.endSession();
    environment.setOwner("B");
    await environment.store.beginVerifiedLogin("B");
    await render("B");
    await act(async () => {
      await current.refreshPending();
    });
    expect(current.localPending).toEqual([]);
    expect(element.textContent).not.toContain("Прививка");
    expect(environment.values.get(key1)).toBe(raw1);
    environment.expectLegacyUnchanged();
  });
  it("storage read failures after verified E1 restart suppress pending UI, then recover without mutation", async () => {
    await act(async () => {
      await save();
    });
    const bytes = new Map(environment.values);
    await act(async () => root.unmount());
    root = createRoot(element);
    const restarted = environment.newQueueAfterRestart();
    expect(await restarted.restoreVerifiedSession("A")).toBe(true);
    environment.injected.queue = restarted;
    await render("A");
    environment.failReads(true);
    await act(async () => {
      await current.refreshPending();
    });
    expect(current.pendingReadStatus).toBe("UNAVAILABLE");
    expect(element.textContent).toContain("Не удалось проверить записи на устройстве");
    expect(current.localPending).toEqual([]);
    expect(element.textContent).not.toContain("Прививка");
    environment.failReads(false);
    await act(async () => {
      await current.refreshPending();
    });
    expect(current.pendingReadStatus).toBe("READY");
    expect(element.textContent).not.toContain("Не удалось проверить записи на устройстве");
    expect(current.localPending).toHaveLength(1);
    expect(element.textContent).toContain("Прививка");
    expect(environment.values).toEqual(bytes);
    environment.expectLegacyUnchanged();
  });
  it("setItem disk failure does not report saved, close form or produce pending bytes", async () => {
    environment.failWrites();
    await act(async () => {
      await save();
    });
    expect(saved).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0][0].message).toBe("DISK_FULL");
    expect(current.localPending).toEqual([]);
    expect(current.isSaving).toBe(false);
    expect(environment.writes).toHaveLength(0);
    environment.expectLegacyUnchanged();
  });
  it("a write ACK without readable restored receipt is uncertain, never a saved notification", async () => {
    environment.failReads(true);
    await act(async () => {
      await save();
    });
    expect(environment.writes).toHaveLength(1);
    expect(saved).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(current.localPending).toEqual([]);
    environment.failReads(false);
    await act(async () => {
      await current.refreshPending();
    });
    expect(current.pendingReadStatus).toBe("READY");
    expect(element.textContent).not.toContain("Не удалось проверить записи на устройстве");
    expect(current.localPending).toHaveLength(1);
    environment.expectLegacyUnchanged();
  });
  it("closing screen while setItem is pending cannot show success after storage resumes", async () => {
    const release = environment.suspend();
    let pending!: Promise<void>;
    await act(async () => {
      pending = save();
    });
    await environment.entered;
    expect(current.isSaving).toBe(true);
    await act(async () => {
      current.deactivate();
    });
    expect(current.isSaving).toBe(false);
    await act(async () => {
      release.resolve();
      await pending;
    });
    expect(saved).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(current.localPending).toEqual([]);
    await act(async () => {
      current.activate();
      await current.refreshPending();
    });
    expect(current.localPending).toHaveLength(1);
    environment.expectLegacyUnchanged();
  });
  it("hides a committed A preview immediately when the verified owner changes, before any focus reread", async () => {
    await act(async () => {
      await save();
    });
    expect(current.localPending).toHaveLength(1);
    environment.setOwner("B");
    await render("B");
    expect(current.localPending).toEqual([]);
    await environment.store.endSession();
    await environment.store.beginVerifiedLogin("B");
    await act(async () => {
      await current.refreshPending();
    });
    expect(current.localPending).toEqual([]);
    environment.expectLegacyUnchanged();
  });
  it("blocks double-tap while the same durable write is in flight", async () => {
    const release = environment.suspend();
    let first!: Promise<void>;
    await act(async () => {
      first = save();
    });
    await environment.entered;
    await act(async () => {
      await save();
    });
    expect(environment.writes).toHaveLength(0);
    await act(async () => {
      release.resolve();
      await first;
    });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
    expect(environment.writes).toHaveLength(1);
    expect(current.localPending).toHaveLength(1);
    environment.expectLegacyUnchanged();
  });
  it("owner switch during pending durable write never shows A success or restores A's entry to B", async () => {
    const release = environment.suspend();
    let pending!: Promise<void>;
    await act(async () => {
      pending = save();
    });
    await environment.entered;
    environment.setOwner("B");
    const ending = environment.store.endSession();
    await render("B");
    await act(async () => {
      release.resolve();
      await pending;
      await ending;
    });
    expect(saved).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(current.localPending).toEqual([]);
    await environment.store.beginVerifiedLogin("B");
    await act(async () => {
      await current.refreshPending();
    });
    expect(current.localPending).toEqual([]);
    const afterRestart = environment.newQueueAfterRestart();
    expect(await afterRestart.restoreVerifiedSession("B")).toBe(true);
    expect(await readOwnPendingPrevention(afterRestart, "pet-A", "B")).toEqual([]);
    environment.expectLegacyUnchanged();
  });
});
