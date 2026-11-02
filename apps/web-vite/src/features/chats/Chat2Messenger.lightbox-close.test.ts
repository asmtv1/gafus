import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(new URL("./Chat2Messenger.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./Chat2Messenger.module.css", import.meta.url), "utf8");

const closeStyleStart = css.indexOf(".mediaLightboxClose {");
const closeStyleEnd = css.indexOf("}", closeStyleStart);
const closeStyle = css.slice(closeStyleStart, closeStyleEnd);

describe("Web Chat2 photo viewer close control", () => {
  it("has fixed 44px hit area and resets inherited button padding", () => {
    expect(closeStyleStart).toBeGreaterThan(0);
    expect(closeStyle).toContain("position: fixed;");
    expect(closeStyle).toContain("box-sizing: border-box;");
    expect(closeStyle).toContain("width: 44px;");
    expect(closeStyle).toContain("height: 44px;");
    expect(closeStyle).toContain("padding: 0;");
    expect(closeStyle).toContain("place-items: center;");
  });

  it("keeps the close control in a screen corner instead of covering the image", () => {
    expect(closeStyle).toContain("safe-area-inset-top");
    expect(closeStyle).toContain("safe-area-inset-right");
    expect(closeStyle).toContain("border-radius: 50%;");
    expect(css).toContain(".mediaLightboxClose:focus-visible {");
  });

  it("uses a centered SVG cross and preserves accessible click-to-close", () => {
    const button = component.slice(component.indexOf("ref={closeButton}"),
      component.indexOf("</button>", component.indexOf("ref={closeButton}")));
    expect(button).toContain('aria-label="Закрыть просмотр"');
    expect(button).toContain("onClick={() => setFullscreen(null)}");
    expect(button).toContain('<svg viewBox="0 0 24 24"');
    expect(button).toContain('aria-hidden="true"');
    expect(button).toContain('<path d="M5 5l14 14M19 5 5 19" />');
    expect(button).not.toContain(">×");
  });
});
