// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileFeedPollDraft } from "./FeedPollComposer";
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TextInput: ({ value, placeholder, onChangeText, editable }: {
    value: string; placeholder?: string; onChangeText: (text: string) => void; editable?: boolean;
  }) => <input value={value} placeholder={placeholder} disabled={editable === false}
    onChange={e => onChangeText(e.target.value)} />,
  Pressable: ({ children, onPress, disabled, accessibilityLabel }: {
    children: React.ReactNode; onPress: () => void; disabled?: boolean; accessibilityLabel?: string;
  }) => <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>{children}</button>,
  Switch: ({ value, onValueChange }: { value: boolean; onValueChange: (value: boolean) => void }) =>
    <input type="checkbox" checked={value} onChange={event => onValueChange(event.target.checked)} />,
}));
vi.mock("expo-image", () => ({
  Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} alt="photo-preview" />,
}));
vi.mock("@/shared/config", () => ({ COLORS: {}, FONTS: {} }));
vi.mock("@/shared/components", () => ({
  Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
    <button disabled={disabled} onClick={onPress}>{label}</button>,
}));
import { FeedPollComposer } from "./FeedPollComposer";
let host: HTMLDivElement, root: Root, latest: MobileFeedPollDraft | null;
function Harness() {
  const [value, onChange] = useState<MobileFeedPollDraft | null>(null);
  latest = value;
  return <FeedPollComposer value={value} onChange={onChange} disabled={false}
    onPickImage={index => onChange(previous => previous ? {
      ...previous,
      options: previous.options.map((option, i) => i === index ? { ...option, imageAsset: {
        requestId: "local-photo", bytes: 123, uri: "file://dog.jpg", filename: "dog.jpg",
        kind: "photo", mime: "image/jpeg",
      } } : option),
    } : previous)}
    onRemoveImage={index => onChange(previous => previous ? {
      ...previous,
      options: previous.options.map((option, i) => i === index ? { ...option, imageAsset: undefined } : option),
    } : previous)} />;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
function click(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find(node => node.textContent?.includes(text));
  expect(button).toBeTruthy(); button?.click();
}
describe("Mobile poll editor", () => {
  it("picks and removes an individual option photo", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => click("Добавить опрос"));
    const pick = host.querySelector<HTMLButtonElement>('button[aria-label="Фото варианта 1"]');
    await act(async () => pick?.click());
    expect(latest?.options[0].imageAsset?.uri).toBe("file://dog.jpg");
    expect(host.querySelector('img[alt="photo-preview"]')).not.toBeNull();
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="Убрать фото варианта 1"]');
    await act(async () => remove?.click());
    expect(latest?.options[0].imageAsset).toBeUndefined();
  });

  it("builds choices, opens quiz options and supports a defined end date", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => click("Добавить опрос"));
    expect(latest?.options).toHaveLength(2);
    await act(async () => click("Ещё вариант"));
    expect(latest?.options).toHaveLength(3);
    await act(async () => {
      const input = host.querySelector<HTMLInputElement>('input[placeholder="Вариант 1"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Да");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(latest?.options[0].text).toBe("Да");
    await act(async () => click("3 дн."));
    expect(latest?.endDate).toBeTruthy();
    await act(async () => click("Убрать"));
    expect(latest).toBeNull();
  });
});
