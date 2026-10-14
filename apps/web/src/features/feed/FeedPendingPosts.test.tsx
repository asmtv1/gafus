// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedPendingPosts } from "./FeedViews";
import type { PublicationItem } from "@gafus/core/services/feed/publication-client";

const { listPendingPosts, deletePost } = vi.hoisted(() => ({
  listPendingPosts: vi.fn(),
  deletePost: vi.fn(),
}));
const localStore = vi.hoisted(() => ({ snapshot: [] as PublicationItem[] }));

vi.mock("@mui/icons-material", () => ({
  ChatBubbleOutlineRounded: () => null,
  ChevronLeftRounded: () => null,
  ChevronRightRounded: () => null,
  FavoriteBorderRounded: () => null,
  VisibilityOutlined: () => null,
}));
vi.mock("./FeedActions", () => ({
  FeedActions: () => null,
  FeedReportForm: () => null,
}));
vi.mock("./FeedTopBar", () => ({ FeedTopBar: () => null }));
vi.mock("./FeedAlbumPicker", () => ({ FeedAlbumPicker: () => null }));
vi.mock("./FeedComposeMedia", () => ({ FeedComposeMedia: () => null }));
vi.mock("./FeedVideo", () => ({ FeedVideo: () => null }));
vi.mock("@/features/gafus/GafusPostProgress", () => ({ GafusPostProgress: () => null }));
vi.mock("@/shared/components/media/CdnImage", () => ({ CdnImage: () => null }));
vi.mock("./upload", () => ({
  uploadFeedBrowserAsset: vi.fn(),
  validateBrowserFeedFiles: vi.fn(),
}));
vi.mock("./telemetry", () => ({ webFeedTelemetry: {} }));
vi.mock("./visibility", () => ({ observeFeedVisibility: vi.fn() }));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "owner-1" } }, status: "authenticated" }),
}));
vi.mock("./api", () => ({
  feedApi: { listPendingPosts, deletePost },
}));
vi.mock("./publication", () => ({
  webFeedPublications: {
    subscribe: () => () => undefined,
    getSnapshot: () => localStore.snapshot,
    retry: vi.fn(),
    dismiss: vi.fn(),
  },
}));
vi.mock("@gafus/error-handling", () => ({ reportClientError: vi.fn() }));
vi.mock("@/shared/components/ui", () => ({
  SecondaryButton: ({
    children,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button {...props}>{children}</button>
  ),
  SecondaryButtonLink: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
  PrimaryButtonLink: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a {...props} data-shared-primary="true" href={href}>
      {children}
    </a>
  ),
  LoadingState: () => null,
  PrimaryButton: () => null,
  AppBackButtonLink: () => null,
}));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const draft = {
  id: "draft-1",
  text: "",
  status: "failed",
};

beforeEach(() => {
  localStore.snapshot = [];
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  listPendingPosts.mockReset().mockResolvedValue({ items: [draft] });
  deletePost.mockReset().mockResolvedValue({ id: "draft-1" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <FeedPendingPosts />
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await vi.waitFor(() => expect(host.textContent).toContain("Незавершённые публикации"));
}

function removeButton() {
  return host.querySelector<HTMLButtonElement>(
    'button[aria-label^="Удалить незавершённую публикацию"]',
  );
}

describe("FeedPendingPosts", () => {
  it("offers a delete action alongside continue, but respects cancel", async () => {
    await render();
    expect(host.querySelector('a[href="/feed/create?edit=draft-1"]')?.textContent).toContain(
      "Продолжить",
    );
    expect(
      host
        .querySelector('a[href="/feed/create?edit=draft-1"]')
        ?.getAttribute("data-shared-primary"),
    ).toBe("true");
    expect(removeButton()?.textContent).toBe("Удалить");
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await act(async () => removeButton()?.click());
    expect(deletePost).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Публикация с вложениями");
  });

  it("deletes a confirmed draft and removes it from the list", async () => {
    deletePost.mockImplementationOnce(async () => {
      listPendingPosts.mockResolvedValue({ items: [] });
      return { id: "draft-1" };
    });
    await render();
    await act(async () => removeButton()?.click());
    await vi.waitFor(() => expect(deletePost).toHaveBeenCalledExactlyOnceWith("draft-1"));
    await vi.waitFor(() => expect(removeButton()).toBeNull());
    expect(vi.mocked(window.confirm)).toHaveBeenCalledOnce();
  });

  it("keeps the draft visible and shows an error if deletion fails", async () => {
    deletePost.mockRejectedValueOnce(new Error("Не удалось удалить вложения"));
    await render();
    await act(async () => removeButton()?.click());
    await vi.waitFor(() =>
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "Не удалось удалить вложения",
      ),
    );
    expect(removeButton()).not.toBeNull();
    expect(host.textContent).toContain("Публикация с вложениями");
  });

  it("shows a full opaque mascot while processing, without a faded photo overlay", async () => {
    localStore.snapshot = [{
      id: "local-processing", ownerId: "owner-1", text: "Меняю интерфейс",
      previewUri: "blob:dog-preview", attachmentCount: 1,
      phase: "processing", progress: null,
    }];
    await render();
    const mascot = host.querySelector<HTMLImageElement>(
      'img[src="/images/loading-mascot-router.webp"]',
    );
    expect(mascot).not.toBeNull();
    expect(host.querySelector('img[src="/images/loading-mascot-router-poster.webp"]')).not.toBeNull();
    expect(host.querySelector('img[src="blob:dog-preview"]')).toBeNull();
    expect(host.textContent).toContain("Обрабатываем публикацию…");
  });

  it("shows the publication preview when the upload fails", async () => {
    localStore.snapshot = [{
      id: "local-failed", ownerId: "owner-1", text: "Мой пост",
      previewUri: "blob:failed-preview", attachmentCount: 1,
      phase: "failed", progress: null,
    }];
    await render();
    expect(host.querySelector('img[src="blob:failed-preview"]')).not.toBeNull();
    expect(host.querySelector('img[src="/images/loading-mascot-router.webp"]')).toBeNull();
  });
});
