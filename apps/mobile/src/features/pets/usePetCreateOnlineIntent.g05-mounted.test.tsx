// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  owner: "A",
  epoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
  ids: ["8ae52e9a-580f-4ab8-9545-397973bc32f5", "5639c98f-7140-4846-87f7-283a40ae1906"],
  uuid: vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: m.uuid }));
vi.mock("@/shared/lib/api/pets", () => ({ petsApi: { create: vi.fn() } }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (sel: (x: { user: { id: string } }) => unknown) => sel({ user: { id: m.owner } }),
    { getState: () => ({ user: { id: m.owner } }) },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({ principalId: m.owner, authEpoch: m.epoch }),
  },
}));
import { usePetCreateOnlineIntent } from "./usePetCreateOnlineIntent";
import type { petsApi } from "@/shared/lib/api/pets";
const draft = {
  name: "Бим",
  type: "DOG" as const,
  breed: "Корги",
  birthDate: "2020-03-15",
  weightKg: 4.25,
};
let current: ReturnType<typeof usePetCreateOnlineIntent>;
function Harness({ create }: { create: typeof petsApi.create }) {
  current = usePetCreateOnlineIntent(create);
  return null;
}
let root: Root;
let div: HTMLDivElement;
async function mount(create: typeof petsApi.create) {
  await act(async () => root.render(createElement(Harness, { create })));
}
describe("G05 actual online handler mounted; transport fully mocked", () => {
  beforeEach(() => {
    m.owner = "A";
    m.epoch = "51e35071-0752-4f22-b3aa-23f8844c8931";
    const ids = [...m.ids];
    m.uuid.mockImplementation(() => ids.shift());
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    div = document.createElement("div");
    root = createRoot(div);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });
  it("keeps JSON key and immutable weight/date payload on uncertain and explicit retry; no auto resend", async () => {
    const calls: unknown[] = [];
    const create = vi.fn().mockImplementation(async (body) => {
      calls.push(body);
      return calls.length === 1
        ? { success: false, code: "PET_CREATE_RESULT_UNCONFIRMED" }
        : { success: true, data: { id: "pet1", ownerId: "A" } };
    });
    await mount(create);
    await act(async () => {
      await expect(current.submit(draft)).rejects.toThrow("UNCONFIRMED");
    });
    expect(current.uncertain).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => {
      await current.submit({ ...draft, name: "edited" });
    });
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0]).toMatchObject({ ...draft, clientRequestId: m.ids[0] });
    expect(current.uncertain).toBe(false);
  });
  it("terminal 409 clears key; deliberate new operation rotates UUID", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ success: false, code: "PET_CREATE_REQUEST_CONFLICT" })
      .mockResolvedValue({ success: true, data: { id: "p2", ownerId: "A" } });
    await mount(create);
    await act(async () => {
      await expect(current.submit(draft)).rejects.toThrow("PET_CREATE_REQUEST_CONFLICT");
    });
    expect(current.uncertain).toBe(false);
    await act(async () => {
      await current.submit(draft, true);
    });
    expect(create.mock.calls[1][0].clientRequestId).not.toBe(
      create.mock.calls[0][0].clientRequestId,
    );
  });
  it("fences late owner/epoch response, rejects mismatched successful owner", async () => {
    let resolve!: (v: unknown) => void;
    const create = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce({ success: true, data: { id: "p", ownerId: "B" } });
    await mount(create);
    let work!: Promise<unknown>;
    await act(async () => {
      work = current.submit(draft);
    });
    m.epoch = "d8f37921-b880-4b04-ae14-96c2e749b029";
    await act(async () => {
      resolve({ success: true, data: { id: "old", ownerId: "A" } });
      await expect(work).rejects.toThrow("SESSION_CHANGED");
    });
    expect(current.uncertain).toBe(false);
    await act(async () => {
      await expect(current.submit(draft)).rejects.toThrow("G05_RESULT_UNCONFIRMED");
    });
  });
  it("cancel keeps no pending operation and invalid account blocks request", async () => {
    const create = vi.fn();
    await mount(create);
    m.owner = "B";
    await act(async () => {
      await expect(current.submit(draft)).rejects.toThrow("SESSION_UNVERIFIED");
    });
    expect(create).not.toHaveBeenCalled();
  });
});
