// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { SelectChevron } from "./SelectChevron";

/** One reusable disclosure image, same asset native select CSS references. */
describe("shared SelectChevron", () => {
  it("renders a decorative consistent asset, rotates when expanded, and keeps no text arrows", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<SelectChevron className="custom-arrow" />));
      const arrow = host.querySelector<HTMLImageElement>("img.gafus-select-chevron");
      expect(arrow?.getAttribute("aria-hidden")).toBe("true");
      expect(arrow?.getAttribute("alt")).toBe("");
      expect(arrow?.getAttribute("src")).toBeTruthy();
      expect(arrow?.classList.contains("custom-arrow")).toBe(true);
      expect(arrow?.classList.contains("gafus-select-chevron-expanded")).toBe(false);
      const sharedSrc = arrow?.getAttribute("src");
      await act(async () => root.render(<SelectChevron expanded />));
      expect(host.querySelector("img")?.getAttribute("src")).toBe(sharedSrc);
      expect(host.querySelector("img")?.classList.contains("gafus-select-chevron-expanded"))
        .toBe(true);
      expect(host.textContent).toBe("");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
