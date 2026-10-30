import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPushRegistrationCoordinator } from "./pushRegistrationOwner";

const A1 = { ownerId: "A", authEpoch: "A-E1" };
const A2 = { ownerId: "A", authEpoch: "A-E2" };
const B1 = { ownerId: "B", authEpoch: "B-E1" };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let active: typeof A1 | typeof A2 | typeof B1 | null;
let mounted: boolean;
const current = () => active;
const live = () => mounted;
let coordinator: ReturnType<typeof createPushRegistrationCoordinator>;
beforeEach(() => {
  active = A1;
  mounted = true;
  coordinator = createPushRegistrationCoordinator();
});

describe("AG3 NOTIF050 push owner+epoch coordinator", () => {
  it("single-flights repeated mount/effect attempts for the exact owner/epoch", async () => {
    const wait = deferred<boolean>();
    const operation = vi.fn(() => wait.promise);
    const first = coordinator.run(A1, current, live, operation);
    const second = coordinator.run(A1, current, live, operation);
    expect(operation).toHaveBeenCalledTimes(1);
    wait.resolve(true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });
  it("discards late A1 token result after A->B->A2 and does not attach to new owner", async () => {
    const wait = deferred<string>();
    const save = vi.fn(async () => true);
    const job = coordinator.run(A1, current, live, async (actor, check) =>
      coordinator.registerToken(actor, "expo", await wait.promise, check, save),
    );
    active = B1;
    active = A2;
    wait.resolve("ExpoPushToken[secret]");
    expect(await job).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it("does not save after screen unmount while provider token pending", async () => {
    const wait = deferred<string>();
    const save = vi.fn(async () => true);
    const job = coordinator.run(A1, current, live, async (actor, check) => {
      const token = await wait.promise;
      return coordinator.registerToken(actor, "expo", token, check, save);
    });
    mounted = false;
    wait.resolve("expo-rotating-token");
    expect(await job).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it("deduplicates a successful same-epoch registration and saves a rotated token", async () => {
    const save = vi.fn(async () => true);
    const first = async (token: string) =>
      coordinator.run(A1, current, live, async (actor, check) =>
        coordinator.registerToken(actor, "expo", token, check, save),
      );
    expect(await first("expo-original")).toBe(true);
    expect(await first("expo-original")).toBe(true);
    expect(await first("expo-rotated")).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("never reuses A1 success state for B1 or A2", async () => {
    const save = vi.fn(async () => true);
    const run = async (actor: typeof A1) =>
      coordinator.run(actor, current, live, async (a, check) =>
        coordinator.registerToken(a, "rustore", "same-device-token", check, save),
      );
    expect(await run(A1)).toBe(true);
    active = B1;
    expect(await run(B1)).toBe(true);
    active = A2;
    expect(await run(A2)).toBe(true);
    expect(save).toHaveBeenCalledTimes(3);
  });
  it("unregister blocks concurrent registration and permits re-enable after DELETE ACK", async () => {
    const wait = deferred<boolean>();
    const deleteCall = vi.fn(() => wait.promise);
    const save = vi.fn(async () => true);
    const disable = coordinator.unregister(A1, current, live, deleteCall);
    expect(deleteCall).toHaveBeenCalledOnce();
    const tryRegister = () =>
      coordinator.run(A1, current, live, async (actor, check) =>
        coordinator.registerToken(actor, "expo", "device-x", check, save),
      );
    expect(await tryRegister()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    wait.resolve(true);
    expect(await disable).toBe(true);
    expect(await tryRegister()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });
  it("DELETE awaits in-flight registration before revocation", async () => {
    const sending = deferred<boolean>();
    const register = coordinator.run(A1, current, live, () => sending.promise);
    const deleted = vi.fn(async () => true);
    const unregister = coordinator.unregister(A1, current, live, deleted);
    expect(deleted).not.toHaveBeenCalled();
    sending.resolve(true);
    expect(await register).toBe(false); // superseded by disable
    expect(await unregister).toBe(true);
    expect(deleted).toHaveBeenCalledOnce();
  });
  it("uncertain/partial DELETE forgets earlier success so explicit re-enable never skips POST", async () => {
    const save = vi.fn(async () => true);
    const again = () =>
      coordinator.run(A1, current, live, async (actor, guard) =>
        coordinator.registerToken(actor, "expo", "stable-device", guard, save),
      );
    expect(await again()).toBe(true);
    expect(await again()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(await coordinator.unregister(A1, current, live, async () => false)).toBe(false);
    expect(await again()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("unregister fails closed on logout, uncertainty and unmount", async () => {
    const wait = deferred<boolean>();
    const deleteCall = vi.fn(() => wait.promise);
    const disable = coordinator.unregister(A1, current, live, deleteCall);
    active = null;
    wait.resolve(true);
    expect(await disable).toBe(false);
    expect(await coordinator.unregister(A1, current, live, deleteCall)).toBe(false);
    active = A1;
    expect(await coordinator.unregister(A1, current, live, async () => false)).toBe(false);
    mounted = false;
    expect(await coordinator.unregister(A1, current, live, async () => true)).toBe(false);
  });
  it("acknowledged owner-scoped DELETE invalidates dedup so re-enable POSTs same token", async () => {
    const save = vi.fn(async () => true);
    const once = () =>
      coordinator.run(A1, current, live, async (actor, check) =>
        coordinator.registerToken(actor, "expo", "repeat-token", check, save),
      );
    expect(await once()).toBe(true);
    expect(await once()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    coordinator.invalidateActor(A1);
    expect(await once()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("does not cache failed or post-switch acknowledgements", async () => {
    const save = vi.fn(async () => false);
    const once = () =>
      coordinator.run(A1, current, live, async (actor, check) =>
        coordinator.registerToken(actor, "expo", "token", check, save),
      );
    expect(await once()).toBe(false);
    save.mockResolvedValue(true);
    expect(await once()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
