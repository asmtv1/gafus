// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedPostDto } from "@gafus/types";
import { FeedActions } from "./FeedActions";

const { deletePost, setBookmark, invalidateQueries } = vi.hoisted(() => ({
  deletePost: vi.fn(),
  setBookmark: vi.fn(),
  invalidateQueries: vi.fn(async () => undefined),
}));
vi.mock("./api", () => ({
  feedApi: {
    deletePost,
    setBookmark,
    setAuthorPreference: vi.fn(),
    report: vi.fn(),
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock("@mui/icons-material", () => {
  const Icon = () => <span aria-hidden="true">•</span>;
  return {
    MoreHorizRounded: Icon,
    BookmarkBorderRounded: Icon,
    BookmarkRounded: Icon,
    ContentCopyRounded: Icon,
    DeleteOutlineRounded: Icon,
    EditOutlined: Icon,
    InfoOutlined: Icon,
    NotificationsNoneRounded: Icon,
    NotificationsOffOutlined: Icon,
    ReportOutlined: Icon,
    VisibilityOffOutlined: Icon,
  };
});
vi.mock("@/shared/components/ui", () => ({
  PrimaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  SecondaryButton: ({
    children,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button {...props}>{children}</button>
  ),
  SecondaryButtonLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

let host: HTMLDivElement;
let root: Root;
const post = (owner: boolean): FeedPostDto =>
  ({
    id: "post-1",
    canDelete: owner,
    canEdit: owner,
    author: { id: "owner-1" },
    bookmarked: false,
    authorNotify: false,
    recommendationReason: null,
  }) as FeedPostDto;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  deletePost.mockReset().mockResolvedValue({ id: "post-1" });
  setBookmark.mockReset().mockResolvedValue({});
  invalidateQueries.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function render(owner = true, onDeleted?: () => void) {
  return act(async () => root.render(<FeedActions post={post(owner)} onDeleted={onDeleted} />));
}
async function openActions() {
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Действия с публикацией"]',
  );
  expect(trigger).not.toBeNull();
  await act(async () => trigger!.click());
  expect(trigger?.getAttribute("aria-expanded")).toBe("true");
}
function deleteButton() {
  return Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Удалить публикацию"),
  );
}

describe("FeedActions", () => {
  it("renders an inherited icon button and opens contextual actions only on demand", async () => {
    await render();
    expect(host.querySelector("summary")).toBeNull();
    expect(deleteButton()).toBeUndefined();
    await openActions();
    expect(deleteButton()).toBeDefined();
    expect(host.querySelector('a[href="/feed/create?edit=post-1"]')).not.toBeNull();
  });

  it("shows delete only for the author", async () => {
    await render(false);
    await openActions();
    expect(deleteButton()).toBeUndefined();
    expect(host.textContent).toContain("Скопировать ссылку");
    expect(host.textContent).toContain("Сохранить в закладках");
  });

  it("closes the action popover with Escape", async () => {
    await render();
    await openActions();
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(
      host
        .querySelector('button[aria-label="Действия с публикацией"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(deleteButton()).toBeUndefined();
  });

  it("does nothing when deletion is cancelled", async () => {
    await render();
    await openActions();
    vi.mocked(window.confirm).mockReturnValue(false);
    await act(async () => deleteButton()!.click());
    expect(deletePost).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("deletes only after confirmation and refreshes feed", async () => {
    const onDeleted = vi.fn();
    await render(true, onDeleted);
    await openActions();
    await act(async () => deleteButton()!.click());
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(deletePost).toHaveBeenCalledExactlyOnceWith("post-1");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["feed"] });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("shows errors and retains the publication if deletion fails", async () => {
    deletePost.mockRejectedValueOnce(new Error("Не удалось удалить файлы"));
    const onDeleted = vi.fn();
    await render(true, onDeleted);
    await openActions();
    await act(async () => deleteButton()!.click());
    expect(host.textContent).toContain("Не удалось удалить файлы");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("keeps bookmarking available as a shared action", async () => {
    await render();
    await openActions();
    const bookmark = Array.from(host.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("Сохранить в закладках"),
    );
    expect(bookmark).toBeDefined();
    await act(async () => bookmark!.click());
    expect(setBookmark).toHaveBeenCalledExactlyOnceWith("post-1", true);
  });
});
