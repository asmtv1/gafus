// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedComposeMedia } from "./FeedComposeMedia";

vi.mock("@mui/icons-material", () => ({
  AddPhotoAlternateOutlined: () => <span>Фото</span>,
  ArrowBackRounded: () => <span>←</span>,
  ArrowForwardRounded: () => <span>→</span>,
  CloseRounded: () => <span>×</span>,
  MovieOutlined: () => <span>Видео</span>,
}));

let host: HTMLDivElement;
let root: Root;
const createObjectURL = vi.fn(() => "blob:gafus-photo");
const revokeObjectURL = vi.fn();
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const photo = new File(["image-bytes"], "patri.jpg", { type: "image/jpeg" });
const photo2 = new File(["more-bytes"], "dog.png", { type: "image/png" });
const first = { file: photo, requestId: "request-1" };
const second = { file: photo2, requestId: "request-2" };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true, value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true, value: revokeObjectURL,
  });
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  if (originalCreate) {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreate });
  } else {
    Reflect.deleteProperty(URL, "createObjectURL");
  }
  if (originalRevoke) {
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevoke });
  } else {
    Reflect.deleteProperty(URL, "revokeObjectURL");
  }
});

describe("FeedComposeMedia local previews", () => {
  it("shows selected photos before upload and frees temporary URLs when removed", async () => {
    const onRemove = vi.fn();
    await act(async () => {
      root.render(
        <FeedComposeMedia
          files={[first]}
          disabled={false}
          remaining={9}
          onSelect={vi.fn()}
          onMove={vi.fn()}
          onRemove={onRemove}
        />,
      );
    });

    const image = host.querySelector("img");
    expect(image?.getAttribute("src")).toBe("blob:gafus-photo");
    expect(image?.getAttribute("alt")).toContain("patri.jpg");
    expect(createObjectURL).toHaveBeenCalledWith(photo);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Убрать вложение: patri.jpg"]')?.click();
    });
    expect(onRemove).toHaveBeenCalledWith("request-1");

    await act(async () => {
      root.render(
        <FeedComposeMedia
          files={[]}
          disabled={false}
          remaining={10}
          onSelect={vi.fn()}
          onMove={vi.fn()}
          onRemove={vi.fn()}
        />,
      );
    });
    expect(host.querySelector("img")).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:gafus-photo");
  });

  it("allows accessible reordering and has a visible add-more control", async () => {
    const onMove = vi.fn();
    await act(async () => {
      root.render(
        <FeedComposeMedia
          files={[first, second]}
          disabled={false}
          remaining={8}
          onSelect={vi.fn()}
          onMove={onMove}
          onRemove={vi.fn()}
        />,
      );
    });
    expect(host.querySelectorAll("img")).toHaveLength(2);
    const left = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Переместить dog.png влево"]',
    );
    expect(left?.disabled).toBe(false);
    await act(async () => left?.click());
    expect(onMove).toHaveBeenCalledWith(1, -1);
    expect(host.querySelector('input[aria-label="Выбрать фотографии или видео"]')).not.toBeNull();
  });

  it("shows a video preview instead of a filename-only list", async () => {
    const video = new File(["video-bytes"], "walk.mp4", { type: "video/mp4" });
    await act(async () => {
      root.render(
        <FeedComposeMedia
          files={[{ file: video, requestId: "video-1" }]}
          disabled={false}
          remaining={9}
          onSelect={vi.fn()}
          onMove={vi.fn()}
          onRemove={vi.fn()}
        />,
      );
    });
    expect(host.querySelector("video")?.getAttribute("src")).toBe("blob:gafus-photo");
    expect(host.querySelector("section")?.textContent).toContain("2 минуты");
  });
});
