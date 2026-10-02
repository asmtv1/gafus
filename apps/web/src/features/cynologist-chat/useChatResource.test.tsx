// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatResource } from "./useChatResource";

const mocks = vi.hoisted(() => ({ accountId: "client-one", api: vi.fn() }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: mocks.accountId } } }),
}));
vi.mock("./api", () => ({ chatApi: mocks.api }));
type State = { enabled: boolean; canSend: boolean; chat: { provisionStatus: string } | null };
let resource: ReturnType<typeof useChatResource<State>>;
let root: Root;
let host: HTMLDivElement;
function Harness() {
  resource = useChatResource<State>();
  return null;
}
const ready = { enabled: true, canSend: true, chat: { provisionStatus: "READY" } };
const token = { userId: "gafus-client-one", channelId: "channel-one", token: "synthetic" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.api.mockReset();
  mocks.accountId = "client-one";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("chat resource request ordering", () => {
  it("ignores an older access response even when the transport ignores abort", async () => {
    const old = deferred<State>();
    mocks.api
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ ...ready, canSend: false })
      .mockResolvedValueOnce(token);
    await act(async () => root.render(<Harness />));
    await act(async () => resource.refresh());
    await act(async () => old.resolve(ready));
    expect(resource.state?.canSend).toBe(false);
    expect(mocks.api.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.api).toHaveBeenCalledTimes(3);
  });
  it("obtains the session when a provisioning chat becomes ready on focus", async () => {
    mocks.api
      .mockResolvedValueOnce({ ...ready, chat: { provisionStatus: "PENDING" } })
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce(token);
    await act(async () => root.render(<Harness />));
    expect(resource.session).toBeNull();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(resource.session?.channelId).toBe("channel-one");
  });
  it("cancels a pending session on unmount and prevents late refreshes", async () => {
    const pending = deferred<typeof token>();
    mocks.api.mockResolvedValueOnce(ready).mockReturnValueOnce(pending.promise);
    await act(async () => root.render(<Harness />));
    const refresh = resource.refresh;
    await act(async () => root.unmount());
    expect(mocks.api.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(token);
      await refresh();
      window.dispatchEvent(new Event("focus"));
    });
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
  it("clears another account's session and ignores its late token", async () => {
    const old = deferred<typeof token>();
    mocks.api
      .mockResolvedValueOnce(ready)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ enabled: false, canSend: false, chat: null });
    await act(async () => root.render(<Harness />));
    mocks.accountId = "client-two";
    await act(async () => root.render(<Harness />));
    await act(async () => old.resolve(token));
    expect(resource.session).toBeNull();
    expect(resource.state?.enabled).toBe(false);
  });
});
