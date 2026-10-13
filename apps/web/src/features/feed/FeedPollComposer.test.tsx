// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { WebFeedPollDraft } from "./FeedPollComposer";
vi.mock("@/shared/components/ui", () => ({
  SecondaryButton: ({ children, onClick, disabled, type }: {
    children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button";
  }) => <button type={type} disabled={disabled} onClick={onClick}>{children}</button>,
}));
import { FeedPollComposer } from "./FeedPollComposer";
let host: HTMLDivElement, root: Root, latest: WebFeedPollDraft | null;
function Harness() {
  const [poll, setPoll] = useState<WebFeedPollDraft | null>(null);
  latest = poll;
  return <FeedPollComposer value={poll} onChange={setPoll} disabled={false} />;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:poll-image-test") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(item => item.textContent?.includes(label));
  expect(button).toBeTruthy(); button?.click();
}
function fill(label: string, text: string) {
  const input = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  expect(input).not.toBeNull();
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setValue.call(input, text);
  input?.dispatchEvent(new Event("input", { bubbles: true }));
}
describe("FeedPollComposer Web", () => {
  it("selects a photo for an option and clears the preview on removal", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => click("Добавить опрос"));
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Фото варианта 1"]');
    expect(input).not.toBeNull();
    const file = new File(["image-test"], "dog.webp", { type: "image/webp" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));
    expect(latest?.options[0].imageAsset?.file).toBe(file);
    expect(host.querySelector<HTMLImageElement>('img[alt="Фото варианта 1"]')?.src).toContain("blob:poll-image-test");
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Убрать фото варианта 1"]')?.click());
    expect(latest?.options[0].imageAsset).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:poll-image-test");
  });

  it("creates and removes a poll draft and supports multiple options", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => click("Добавить опрос"));
    expect(latest?.options).toHaveLength(2);
    await act(async () => click("Вариант ответа"));
    expect(latest?.options).toHaveLength(3);
    await act(async () => fill("Вариант ответа 1", "Да"));
    expect(latest?.options[0].text).toBe("Да");
    await act(async () => click("Убрать"));
    expect(latest).toBeNull();
  });
});
