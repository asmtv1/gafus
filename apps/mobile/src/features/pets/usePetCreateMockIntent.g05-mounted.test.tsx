// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owner: "A",
  epoch: "51e35071-0752-4f22-b3aa-23f8844c8931",
  ids: [
    "8ae52e9a-580f-4ab8-9545-397973bc32f5",
    "5639c98f-7140-4846-87f7-283a40ae1906",
    "d8f37921-b880-4b04-ae14-96c2e749b029",
  ],
  randomUUID: vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: mocks.randomUUID }));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (s: { user: { id: string } }) => unknown) => selector({ user: { id: mocks.owner } }),
    { getState: () => ({ user: { id: mocks.owner } }) },
  ),
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () => ({
      schemaVersion: 2,
      principalId: mocks.owner,
      authEpoch: mocks.epoch,
    }),
  },
}));
import { usePetCreateMockIntent, type MockPetCreateTransport } from "./usePetCreateMockIntent";
import { validatePetForm } from "./pet-form-validation";
const draft = {
  name: "Бим",
  type: "DOG" as const,
  breed: "Корги",
  birthDate: "2020-03-15",
  weightKg: 4.25,
};
type Controller = ReturnType<typeof usePetCreateMockIntent>;
let current: Controller;
function Harness({ transport }: { transport: MockPetCreateTransport }) {
  current = usePetCreateMockIntent(transport);
  return null;
}
let root: Root;
let div: HTMLDivElement;
async function render(transport: MockPetCreateTransport) {
  await act(async () => {
    root.render(createElement(Harness, { transport }));
  });
}
describe("G05 mounted mock intent (no real POST)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.owner = "A";
    mocks.epoch = "51e35071-0752-4f22-b3aa-23f8844c8931";
    const ids = [...mocks.ids];
    mocks.randomUUID.mockImplementation(() => {
      const id = ids.shift();
      if (!id) throw Error("fixture-exhausted");
      return id;
    });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    div = document.createElement("div");
    document.body.appendChild(div);
    root = createRoot(div);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    div.remove();
  });
  it("date UTC and optional decimal weight pass exact normalized snapshot through mock, never a header", async () => {
    const valid = validatePetForm({
      name: " Бим ",
      breed: " Корги ",
      birthDate: "15.03.2020",
      weightKg: "4.25",
    });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    const requests: unknown[] = [];
    await render(async (body) => {
      requests.push(body);
      return "UNCERTAIN";
    });
    await act(async () => {
      await current.submit({ ...valid.values, type: "DOG" });
    });
    expect(requests).toEqual([{ ...draft, clientRequestId: mocks.ids[0] }]);
    expect(current.status).toBe("UNCERTAIN");
  });
  it("manual uncertain retry holds stable key/payload; deliberate creation rotates", async () => {
    const requests: Record<string, unknown>[] = [];
    const transport: MockPetCreateTransport = async (body) => {
      requests.push(body);
      return "UNCERTAIN";
    };
    await render(transport);
    await act(async () => {
      await current.submit(draft);
    });
    await act(async () => {
      await current.submit({ ...draft, name: "EDITED" });
    });
    expect(requests[1]).toEqual(requests[0]);
    await act(async () => {
      await current.submit(draft, true);
    });
    expect(requests[2]?.clientRequestId).not.toBe(requests[0]?.clientRequestId);
  });
  it("cancel clears operation and callback cannot resurrect state", async () => {
    let resolve!: (value: "UNCERTAIN") => void;
    await render(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    let work!: Promise<void>;
    await act(async () => {
      work = current.submit(draft);
    });
    await act(async () => {
      current.cancel();
      resolve("UNCERTAIN");
      await work;
    });
    expect(current.status).toBe("IDLE");
  });
  it("unknown transport error retains retry key, owner/epoch switch isolates", async () => {
    const transport = vi
      .fn<MockPetCreateTransport>()
      .mockRejectedValueOnce(new Error("IO"))
      .mockResolvedValue("UNCERTAIN");
    await render(transport);
    await act(async () => {
      await current.submit(draft);
    });
    expect(current.status).toBe("ERROR");
    await act(async () => {
      await current.submit({ ...draft, name: "other" });
    });
    expect(transport.mock.calls[1]?.[0]).toEqual(transport.mock.calls[0]?.[0]);
    mocks.epoch = "d8f37921-b880-4b04-ae14-96c2e749b029";
    await act(async () => {
      await current.submit(draft);
    });
    expect(transport.mock.calls[2]?.[0].clientRequestId).not.toBe(
      transport.mock.calls[0]?.[0].clientRequestId,
    );
    mocks.owner = "B";
    await render(transport);
    expect(current.status).toBe("IDLE");
  });
  it("rejects invalid date/weight before any mock submit", () => {
    expect(
      validatePetForm({ name: "Бим", breed: "Корги", birthDate: "29.02.2025", weightKg: "300" }).ok,
    ).toBe(false);
  });
});
