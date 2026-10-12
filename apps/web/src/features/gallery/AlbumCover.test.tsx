// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AlbumCover } from "./AlbumCover";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("album covers", () => {
  it("renders a readable placeholder when an album has no cover", async () => {
    await act(async () => root.render(<AlbumCover albumId="a" url={null} onLoadError={vi.fn()} />));
    expect(host.textContent).toContain("Нет обложки");
    expect(host.querySelector("img")).toBeNull();
  });

  it("recovers when a refetched signed image URL changes", async () => {
    const onLoadError = vi.fn();
    await act(async () => root.render(
      <AlbumCover albumId="a" url="https://example.com/expired.jpg" onLoadError={onLoadError} />,
    ));
    const img = host.querySelector("img");
    expect(img).not.toBeNull();
    await act(async () => img?.dispatchEvent(new Event("error")));
    expect(onLoadError).toHaveBeenCalledExactlyOnceWith("a");
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("Обложка недоступна");

    await act(async () => root.render(
      <AlbumCover albumId="a" url="https://example.com/refreshed.jpg" onLoadError={onLoadError} />,
    ));
    expect(host.querySelector("img")?.getAttribute("src")).toBe("https://example.com/refreshed.jpg");
  });
});
