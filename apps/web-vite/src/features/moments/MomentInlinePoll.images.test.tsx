// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentInlinePoll, type MomentInlinePollDraft } from "./MomentInlinePoll";

let node: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let current: MomentInlinePollDraft | null = null;
function Harness() {
  const [poll, setPoll] = useState<MomentInlinePollDraft | null>(null);
  current = poll;
  return <MomentInlinePoll value={poll} onChange={setPoll} disabled={false} />;
}
const click = async (text: string) => {
  const button = [...node.querySelectorAll("button")]
    .find(item => item.textContent?.includes(text));
  expect(button).toBeDefined();
  await act(async () => button?.click());
};
const pick = async (file: File) => {
  const input = node.querySelector<HTMLInputElement>('input[aria-label="Фото варианта 1"]');
  expect(input).not.toBeNull();
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("crypto", { randomUUID: () => "550e8400-e29b-41d4-a716-446655440000" });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true, value: vi.fn(() => "blob:real-local-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true, value: vi.fn(),
  });
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove(); vi.unstubAllGlobals(); current = null;
});
describe("WEB4 original Next per-option photo picker", () => {
  it("keeps local file and revocable preview without a network or media ID", async () => {
    await act(async () => root.render(<Harness />));
    await click("Добавить опрос");
    const file = new File(["image"], "dog.webp", { type: "image/webp" });
    await pick(file);
    expect(current?.options[0]?.imageAsset?.file).toBe(file);
    expect(current?.options[0]?.imageAsset?.requestId)
      .toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(current?.options[0]?.imageMediaId).toBeUndefined();
    expect(node.querySelector<HTMLImageElement>('img[alt="Фото варианта 1"]')?.src)
      .toContain("blob:real-local-preview");
    await act(async () => node.querySelector<HTMLButtonElement>(
      'button[aria-label="Убрать фото варианта 1"]',
    )?.click());
    expect(current?.options[0]?.imageAsset).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:real-local-preview");
  });
  it("rejects foreign binary MIME and releases local preview when poll is removed", async () => {
    await act(async () => root.render(<Harness />));
    await click("Добавить опрос");
    await pick(new File(["invalid"], "malware.exe", { type: "application/octet-stream" }));
    expect(current?.options[0]?.imageAsset).toBeUndefined();
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("JPG");
    await pick(new File(["img"], "a.png", { type: "image/png" }));
    await click("Убрать");
    expect(current).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:real-local-preview");
  });
});
