// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mui/icons-material", () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    CheckCircleOutline: Icon, ChatBubbleOutline: Icon, VisibilityOutlined: Icon,
    Close: Icon, AddPhotoAlternateOutlined: Icon, ChevronLeftRounded: Icon,
    ChevronRightRounded: Icon, CloseRounded: Icon,
  };
});
vi.mock("@/shared/components/ui", () => ({
  SecondaryButton: ({children, ...props}: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    <button {...props}>{children}</button>,
}));
vi.mock("./api", () => ({uploadQuestionPhoto: vi.fn(), discardQuestionPhoto: vi.fn()}));
import { Photos } from "./parts";

const images = [
  {id: "one", url: "https://ebiteskukingusk.begetcdn.cloud/questions/uploads/questions/owner/photo1/full.webp"},
  {id: "two", url: "https://ebiteskukingusk.begetcdn.cloud/questions/uploads/questions/owner/photo2/full.webp"},
];
let root: Root;
let host: HTMLDivElement;
const oldShowModal = HTMLDialogElement.prototype.showModal;
const oldClose = HTMLDialogElement.prototype.close;

beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  HTMLDialogElement.prototype.showModal = function () {this.setAttribute("open", "");};
  HTMLDialogElement.prototype.close = function () {
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
  HTMLDialogElement.prototype.showModal = oldShowModal;
  HTMLDialogElement.prototype.close = oldClose;
});

describe("questions photo viewer matches Moments", () => {
  it("shows CDN thumbnails and opens a contained full image in a portal without S3 links", async () => {
    await act(async () => root.render(<Photos photos={images} />));
    expect(host.querySelector("a[href]")).toBeNull();
    expect(host.querySelectorAll('button[aria-label^="Увеличить фотографию"]')).toHaveLength(2);
    expect(host.querySelector("img")?.getAttribute("src")).toContain("thumb.webp");
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Увеличить фотографию 2"]')?.click());
    const dialog = document.querySelector<HTMLDialogElement>('dialog[aria-label="Просмотр фотографии"]');
    expect(dialog?.parentElement).toBe(document.body);
    expect(dialog?.open).toBe(true);
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe(images[1]!.url);
    await act(async () => dialog?.querySelector<HTMLButtonElement>('button[aria-label="Закрыть просмотр"]')?.click());
    expect(dialog?.open).toBe(false);
  });
  it("supports previous/next arrows and keyboard navigation", async () => {
    await act(async () => root.render(<Photos photos={images} />));
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Увеличить фотографию 1"]')?.click());
    const dialog = document.querySelector<HTMLDialogElement>('dialog[aria-label="Просмотр фотографии"]');
    await act(async () => dialog?.querySelector<HTMLButtonElement>('button[aria-label="Следующее фото"]')?.click());
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe(images[1]!.url);
    await act(async () => dialog?.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowLeft", bubbles: true})));
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe(images[0]!.url);
  });
  it("falls back from a delayed thumbnail to the full CDN image", async () => {
    await act(async () => root.render(<Photos photos={[images[0]!]} />));
    const img = host.querySelector("img")!;
    await act(async () => img.dispatchEvent(new Event("error")));
    expect(img.getAttribute("src")).toBe(images[0]!.url);
  });
  it("does not render a viewer for an empty attachment list", async () => {
    await act(async () => root.render(<Photos photos={[]} />));
    expect(host.querySelector("button")).toBeNull();
    expect(document.querySelector('dialog[aria-label="Просмотр фотографии"]')).toBeNull();
  });
});
