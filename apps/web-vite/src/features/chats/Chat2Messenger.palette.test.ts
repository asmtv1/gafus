import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./Chat2Messenger.module.css", import.meta.url), "utf8");
const brand = readFileSync(new URL("../../brand/tokens.css", import.meta.url), "utf8");

function colorFor(source: string, variable: string): string {
  const match = source.match(new RegExp(`--${variable}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`Missing color token: ${variable}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return channels.reduce((sum, value, index) => {
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const olive = colorFor(brand, "accent-primary");
const text = colorFor(css, "chat-text");
const muted = colorFor(css, "chat-text-muted");
const dark = colorFor(css, "chat-olive-dark");

const pairs = [
  ["Primary text", text, "#fffefa"],
  ["Secondary text", muted, "#fffefa"],
  ["Active tab", "#ffffff", olive],
  ["Selected chat", dark, colorFor(css, "chat-selected")],
  ["Incoming bubble", text, colorFor(css, "chat-incoming")],
  ["Outgoing bubble", text, colorFor(css, "chat-outgoing")],
  ["Message timestamp", muted, colorFor(css, "chat-outgoing")],
  ["Search placeholder", muted, "#f8faf6"],
  ["Quick action", dark, colorFor(css, "chat-cream")],
  ["Room header name", "#263a21", "#e1ead8"],
  ["Room header subtitle", "#496142", "#eaf1e4"],
  ["Course chat name", text, "#fffefa"],
  ["Course chat hover", text, colorFor(css, "chat-selected")],
  ["Course chat action", dark, "#fffefa"],
  ["Disabled send icon", "#475743", "#d9e2d3"],
] as const;

describe("Chat 2.0 WCAG AA contrast guard", () => {
  it.each(pairs)("%s meets 4.5:1 contrast minimum", (_label, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("explicitly overrides the global white button text for course and user chat rows", () => {
    const start = css.indexOf("/* Course and user shortcuts are light cards");
    expect(start).toBeGreaterThanOrEqual(0);
    const styles = css.slice(start, css.indexOf(".catalogRow button {", start));
    expect(styles).toContain(".drawer button.catalogRow {");
    expect(styles).toContain("color: var(--chat-text);");
    expect(styles).toContain(".drawer button.catalogRow:is(:hover, :focus-visible):not(:disabled)");
    expect(styles).toContain(".catalogRow > strong {");
    expect(styles).toContain("overflow-wrap: anywhere;");
    expect(styles).toContain(".catalogRow > span:last-child {");
    expect(styles).toContain("color: var(--chat-olive-dark);");
  });

  it("distinguishes only the chat header from the messages with a sage surface", () => {
    const start = css.indexOf("/* Chat2 conversation header: quiet sage band");
    expect(start).toBeGreaterThan(0);
    const section = css.slice(start);
    expect(section).toContain(".room .roomHeader {");
    expect(section).toContain("linear-gradient(105deg, #e1ead8 0%, #eaf1e4 62%, #f3f7f0 100%)");
    expect(section).toContain("border-bottom: 2px solid #a6b991");
    expect(section).toContain("box-shadow: 0 5px 14px");
    expect(section).toContain(".roomHeader .roomHeading strong");
    expect(section).toContain(".roomHeader .roomHeading span");
    expect(section).toContain(".roomHeader .infoDropdown > summary");
    expect(section).not.toContain(".sidebarHead");
  });

  it("keeps native avatar upload out of the sidebar layout while preserving keyboard focus", () => {
    const picker = css.slice(css.indexOf("/* Group avatar: one compact"));
    expect(picker).toContain(".avatarEditor .avatarFileInput {");
    expect(picker).toContain("position: absolute;");
    expect(picker).toContain("width: 1px;");
    expect(picker).toContain(".avatarCopy {");
    expect(picker).toContain("min-width: 0;");
    expect(picker).toContain(".avatarPicker:focus-within");
    expect(picker).not.toContain("display: none;");
  });

  it("uses olive focus in all Chat2 forms and dialogs instead of coral", () => {
    const rules = css.slice(css.indexOf("/* Chat2-wide accessibility:"));
    expect(rules).toContain(".page:global(.shell) :is(input, textarea, select):focus-visible");
    expect(rules).toContain(".page:global(.shell) :is(button, a):focus-visible");
    expect(rules).toContain("outline: none");
    expect(rules).toContain("outline: 2px solid #4d5c2d");
    expect(rules).not.toContain("#d7837b");
  });

  it("removes the coral focus outline from group creation inputs, selects and description", () => {
    const focused = css.slice(css.indexOf("/* Chat2 group form: replace global coral focus"));
    expect(focused).toContain(
      ".page:global(.shell) .form :is(input, select, textarea):focus-visible",
    );
    expect(focused).toContain(".page:global(.shell) .form :is(input, select, textarea):focus");
    expect(focused).toContain("outline: none");
    expect(focused).toContain("border-color: #849b78");
    expect(focused).toContain("box-shadow: 0 0 0 2px rgba(77, 92, 45, .18)");
  });

  it("overrides the global coral keyboard outline only inside chat input fields", () => {
    const focused = css.slice(css.indexOf("/* Chat2 input focus must override"));
    expect(focused).toContain(".page:global(.shell) .search input:focus-visible");
    expect(focused).toContain(".page:global(.shell) .room .composerField textarea:focus-visible");
    expect(focused).toContain("outline: none");
    expect(focused).toContain(".search:focus-within");
    expect(focused).toContain(".composerField:focus-within");
    expect(focused).not.toContain("#d7837b");
  });

  it("styles active chat as an inset card rather than a heavy vertical stripe", () => {
    const active = css.slice(css.indexOf("/* Selected conversation:"));
    expect(active).toContain("width: calc(100% - 20px)");
    expect(active).toContain("margin: 3px 10px");
    expect(active).toContain("border: 1px solid transparent");
    expect(active).toContain("border-radius: 13px");
    expect(active).toContain("border-color: #c5d3b9");
    expect(active).not.toContain("border-left-color: var(--chat-olive)");
  });

  it("gives selected chat an explicit dark text color instead of global button white", () => {
    const selected = new RegExp(
      String.raw`\.chatRow\.selected,\s*\.chatRow\.selected:hover\s*\{[^}]*` +
        String.raw`color:\s*var\(--chat-text\)`,
    );
    const selectedTitle = new RegExp(
      String.raw`\.chatRow\.selected\s+\.chatMeta strong\s*\{[^}]*` +
        String.raw`color:\s*var\(--chat-olive-dark\)`,
    );
    expect(css).toMatch(selected);
    expect(css).toMatch(selectedTitle);
  });
});
