import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(new URL("./Chat2Messenger.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./Chat2Messenger.module.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const begin = styles.indexOf(`${selector} {`);
  expect(begin).toBeGreaterThanOrEqual(0);
  const end = styles.indexOf("}", begin);
  return styles.slice(begin, end);
}

describe("Chat2 viewport scrolling independent of browser document", () => {
  it("scopes viewport locking only to the messenger, not the global app", () => {
    expect(component).toContain("className={`gafus-app ${css.appViewport}`}");
    const app = rule(".appViewport:global(.gafus-app)");
    expect(app).toContain("height: 100dvh;");
    expect(app).toContain("overflow: hidden;");
    const page = rule(".page:global(.shell)");
    expect(page).toContain("height: 0;");
    expect(page).toContain("min-height: 0;");
    expect(page).toContain("overflow: hidden;");
  });

  it("keeps the chat list and history as independently scrolling regions", () => {
    expect(rule(".sidebar")).toContain("overflow: hidden;");
    expect(rule(".room")).toContain("overflow: hidden;");
    expect(rule(".chatList")).toContain("overflow: auto;");
    expect(rule(".chatList")).toContain("overscroll-behavior: contain;");
    expect(rule(".drawer")).toContain("overscroll-behavior: contain;");
    const messages = rule(".messages");
    expect(messages).toContain("overflow-y: auto;");
    expect(messages).toContain("overscroll-behavior: contain;");
    expect(component).toContain("ref={scroll}");
    expect(component).toContain("onScroll={(e) => {");
  });

  it("constrains small screens without forcing the browser to scroll", () => {
    expect(styles).not.toContain("min-height: 430px;");
    expect(styles).not.toContain("height: calc(100dvh - 140px);");
    const mobile = styles.slice(styles.indexOf("@media (max-width: 740px)"));
    expect(mobile).toContain("height: 100%;");
    expect(mobile).toContain("min-height: 0;");
    expect(mobile).toContain(".room.mobileShow {");
  });
});
