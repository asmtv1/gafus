// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { MomentsSaved } from "./MomentsSaved";
import { ApiError } from "../../shared/api/client";
const mocks = vi.hoisted(() => ({ status: vi.fn(), saved: vi.fn() }));
vi.mock("./momentsApi", () => ({ getMomentsStatus: mocks.status, listSavedMoments: mocks.saved }));
vi.mock("./MomentSummary", () => ({
  MomentSummary: ({ post }: { post: { text: string } }) => <li>{post.text}</li>,
}));
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 35));
  });
}
async function mount() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <MomentsSaved userId="viewer" />
      </QueryClientProvider>,
    ),
  );
  await settle();
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  mocks.status.mockReset().mockResolvedValue({ enabled: true, smartEnabled: false });
  mocks.saved.mockReset().mockResolvedValue({ items: [], nextCursor: null });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
});
describe("saved Moments current verified GET", () => {
  it("MS-R01 cached saved posts hidden during fresh saved GET", async () => {
    const pending = deferred<{ items: { id: string; text: string }[]; nextCursor: null }>();
    mocks.saved.mockReturnValue(pending.promise);
    cache.setQueryData(["moments", "saved", "viewer"], {
      pages: [
        {
          items: [{ id: "post1", text: "PRIVATE_OLD_BOOKMARK" }],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });
    await mount();
    expect(host.textContent).toContain("Перепроверяем закладки");
    expect(host.textContent).not.toContain("PRIVATE_OLD_BOOKMARK");
    await act(async () =>
      pending.resolve({ items: [{ id: "post2", text: "Свежая закладка" }], nextCursor: null }),
    );
    await settle();
    expect(host.textContent).toContain("Свежая закладка");
  });
  it("MS-R02 failed refresh of saved GET hides previous items, not fake empty", async () => {
    mocks.saved.mockRejectedValue(new ApiError(503, "PRIVATE_SERVER_DATA"));
    cache.setQueryData(["moments", "saved", "viewer"], {
      pages: [
        {
          items: [{ id: "post1", text: "PRIVATE_OLD_BOOKMARK" }],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });
    await mount();
    expect(host.textContent).not.toContain("PRIVATE_OLD_BOOKMARK");
    expect(host.textContent).not.toContain("Сохранённых публикаций пока нет");
    expect(host.textContent).toContain("Не удалось загрузить закладки");
    expect(host.textContent).not.toContain("PRIVATE_SERVER_DATA");
  });
  it("MS-R03 401 status closes bookmarks and offers login", async () => {
    mocks.status.mockRejectedValue(new ApiError(401, "PRIVATE_AUTH_STACK"));
    cache.setQueryData(["moments", "status", "viewer"], { enabled: true, smartEnabled: false });
    await mount();
    expect(host.textContent).toContain("Сессия завершена");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_AUTH_STACK");
    expect(mocks.saved).not.toHaveBeenCalled();
  });
});
