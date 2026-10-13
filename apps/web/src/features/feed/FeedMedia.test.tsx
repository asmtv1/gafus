// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedPostDto } from "@gafus/types";

vi.mock("@mui/icons-material", () => ({
  ChevronLeftRounded: () => <span aria-hidden="true">‹</span>,
  ChevronRightRounded: () => <span aria-hidden="true">›</span>,
  CloseRounded: () => <span aria-hidden="true">×</span>,
}));
vi.mock("@/shared/components/media/CdnImage", () => ({
  CdnImage: ({ source, alt, className }: { source: string; alt: string; className?: string }) =>
    <img src={source} alt={alt} className={className} />,
}));
vi.mock("./FeedVideo", () => ({
  FeedVideo: () => <span>Видеоплеер</span>,
}));
vi.mock("./api", () => ({
  feedApi: { requestMediaFallback: vi.fn() },
}));

import { FeedMedia } from "./FeedMedia";

const post = {
  attachments: [
    {
      id: "photo-1",
      kind: "photo",
      fullUrl: "https://images.example.test/dog.jpg",
      thumbUrl: null,
    },
    {
      id: "photo-2",
      kind: "photo",
      fullUrl: "https://images.example.test/dog2.jpg",
      thumbUrl: null,
    },
  ],
} as FeedPostDto;

let root: Root;
let host: HTMLDivElement;
const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

describe("FeedMedia photo UX", () => {
  it("shows a contained preview and opens the full photo in a body-level dialog", async () => {
    await act(async () => root.render(<FeedMedia post={post} />));

    expect(host.querySelectorAll("img")).toHaveLength(1);
    const preview = host.querySelector("img");
    expect(preview?.getAttribute("alt")).toBe("Фото 1 из 2");
    expect(preview?.getAttribute("src")).toContain("dog.jpg");

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Увеличить фотографию 1"]')?.click();
    });

    const viewer = document.querySelector<HTMLDialogElement>('dialog[aria-label="Просмотр фотографии"]');
    expect(viewer).not.toBeNull();
    expect(viewer?.parentElement).toBe(document.body);
    expect(viewer?.open).toBe(true);
    expect(viewer?.querySelector("img")?.getAttribute("alt")).toBe("Фото 1 из 2");

    await act(async () => {
      viewer?.querySelector<HTMLButtonElement>('button[aria-label="Закрыть просмотр"]')?.click();
    });
    expect(viewer?.open).toBe(false);
  });

  it("supports navigation with buttons and keyboard while the dialog is open", async () => {
    await act(async () => root.render(<FeedMedia post={post} />));
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Увеличить фотографию 1"]')?.click();
    });
    const viewer = document.querySelector<HTMLDialogElement>('dialog[aria-label="Просмотр фотографии"]');
    await act(async () => {
      viewer?.querySelector<HTMLButtonElement>('button[aria-label="Следующее фото"]')?.click();
    });
    expect(viewer?.querySelector("img")?.getAttribute("src")).toContain("dog2.jpg");
    await act(async () => {
      viewer?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(viewer?.querySelector("img")?.getAttribute("src")).toContain("dog.jpg");
  });

  it("does not show enlargement controls for a video", async () => {
    const videoPost = {
      attachments: [{ id: "video-1", kind: "video", posterUrl: null }],
    } as FeedPostDto;
    await act(async () => root.render(<FeedMedia post={videoPost} />));
    expect(host.textContent).toContain("Видеоплеер");
    expect(host.querySelector('button[aria-label^="Увеличить фотографию"]')).toBeNull();
  });
});
