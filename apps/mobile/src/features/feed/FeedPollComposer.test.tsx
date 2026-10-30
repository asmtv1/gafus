// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileFeedPollDraft } from "./FeedPollComposer";
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children, accessibilityRole, accessibilityLiveRegion }: {
    children: React.ReactNode; accessibilityRole?: string; accessibilityLiveRegion?: string;
  }) => <span role={accessibilityRole} aria-live={accessibilityLiveRegion as "polite" | "assertive" | undefined}>
    {children}</span>,
  TextInput: ({ value, placeholder, onChangeText, editable, accessibilityLabel }: {
    value: string; placeholder?: string; onChangeText: (text: string) => void;
    editable?: boolean; accessibilityLabel?: string;
  }) => <input value={value} placeholder={placeholder} aria-label={accessibilityLabel}
    disabled={editable === false} onChange={e => onChangeText(e.target.value)} />,
  Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityRole,
    accessibilityState }: {
    children: React.ReactNode; onPress: () => void; disabled?: boolean;
    accessibilityLabel?: string; accessibilityRole?: string;
    accessibilityState?: { checked?: boolean; disabled?: boolean };
  }) => <button aria-label={accessibilityLabel} role={accessibilityRole} disabled={disabled}
    aria-checked={accessibilityState?.checked} aria-disabled={accessibilityState?.disabled}
    onClick={onPress}>{children}</button>,
  Switch: ({ value, onValueChange, disabled, accessibilityLabel, accessibilityRole,
    accessibilityState }: {
    value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean;
    accessibilityLabel?: string; accessibilityRole?: string;
    accessibilityState?: { checked?: boolean; disabled?: boolean };
  }) => <input type="checkbox" checked={value} disabled={disabled}
    role={accessibilityRole} aria-label={accessibilityLabel}
    aria-checked={accessibilityState?.checked} aria-disabled={accessibilityState?.disabled}
    onChange={event => onValueChange(event.target.checked)} />,
}));
vi.mock("expo-image", () => ({
  Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} alt="photo-preview" />,
}));
vi.mock("@/shared/config", () => ({ COLORS: {}, FONTS: {} }));
vi.mock("@/shared/components", () => ({
  Button: ({ label, onPress, disabled }: {
    label: string; onPress: () => void; disabled?: boolean;
  }) => <button disabled={disabled} onClick={onPress}>{label}</button>,
}));
import { FeedPollComposer } from "./FeedPollComposer";
let host: HTMLDivElement, root: Root, latest: MobileFeedPollDraft | null;
function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, onChange] = useState<MobileFeedPollDraft | null>(null);
  latest = value;
  return <FeedPollComposer value={value} onChange={onChange} disabled={disabled}
    onPickImage={index => onChange(previous => previous ? {
      ...previous,
      options: previous.options.map((option, i) => i === index ? { ...option, imageAsset: {
        requestId: "local-photo", bytes: 123, uri: "file://dog.jpg", filename: "dog.jpg",
        kind: "photo", mime: "image/jpeg",
      } } : option),
    } : previous)}
    onRemoveImage={index => onChange(previous => previous ? {
      ...previous,
      options: previous.options.map((option, i) => i === index
        ? { ...option, imageAsset: undefined }
        : option),
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


// SOC041_MOBILE_POLL_COMPOSER_A11Y: native accessibility props surfaced by
// the existing JSdom RN mock only. No images or quiz operation in these cases.
function namedField(label: string) {
  return host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
}
function setField(label: string, value: string) {
  const input = namedField(label);
  expect(input).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input?.dispatchEvent(new Event("input", { bubbles: true }));
}
function namedSwitch(label: string) {
  return host.querySelector<HTMLInputElement>(`input[role="switch"][aria-label="${label}"]`);
}
function namedDeadline(label: string) {
  return host.querySelector<HTMLButtonElement>(`button[role="radio"][aria-label="${label}"]`);
}

describe("SOC041_MOBILE_POLL_COMPOSER_A11Y ordinary controlled text poll", () => {
  it("question and indexed option text fields have stable explicit names, unchanged controlled text", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => click("Добавить опрос"));
    expect(namedField("Вопрос опроса")).not.toBeNull();
    expect(namedField("Вариант ответа 1")).not.toBeNull();
    expect(namedField("Вариант ответа 2")).not.toBeNull();
    await act(async () => {
      setField("Вопрос опроса", "Как научить собаку ждать?");
      setField("Вариант ответа 1", "Постепенно");
      setField("Вариант ответа 2", "С подсказкой");
    });
    expect(latest?.question).toBe("Как научить собаку ждать?");
    expect(latest?.options.map(option => option.text)).toEqual(["Постепенно", "С подсказкой"]);
    await act(async () => click("Ещё вариант"));
    expect(namedField("Вариант ответа 3")).not.toBeNull();
    expect(host.querySelector('button[aria-label="Удалить вариант 3"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Удалить вариант 3"]')?.click());
    expect(latest?.options.map(option => option.text)).toEqual(["Постепенно", "С подсказкой"]);
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Удалить опрос"]'))
      .not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>(
      'button[aria-label="Удалить опрос"]')?.click());
    expect(latest).toBeNull();
  });

  it("all ordinary settings are named switches with correct checked states and unchanged callbacks", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => click("Добавить опрос"));
    const labels = ["Несколько вариантов", "Викторина", "Анонимно",
      "Скрывать результаты до завершения", "Перемешивать варианты"] as const;
    for (const label of labels) {
      expect(namedSwitch(label)).not.toBeNull();
      expect(namedSwitch(label)?.getAttribute("aria-checked")).toBe("false");
    }
    await act(async () => namedSwitch("Несколько вариантов")?.click());
    expect(latest?.allowMultiple).toBe(true);
    expect(namedSwitch("Несколько вариантов")?.getAttribute("aria-checked")).toBe("true");
    await act(async () => namedSwitch("Анонимно")?.click());
    expect(latest?.isAnonymous).toBe(true);
    await act(async () => namedSwitch("Скрывать результаты до завершения")?.click());
    expect(latest?.hideResults).toBe(true);
    await act(async () => namedSwitch("Перемешивать варианты")?.click());
    expect(latest?.shuffleOptions).toBe(true);
    expect(latest?.isQuiz).toBe(false);
  });

  it("deadline radios speak full names and expose mutually exclusive selection and disabled state", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => click("Добавить опрос"));
    for (const name of ["Без срока", "Через 1 день", "Через 3 дня", "Через 7 дней"]) {
      expect(namedDeadline(name)).not.toBeNull();
      expect(namedDeadline(name)?.getAttribute("aria-checked"))
        .toBe(String(name === "Без срока"));
    }
    await act(async () => namedDeadline("Через 3 дня")?.click());
    expect(latest?.endDate).toBeTruthy();
    expect(namedDeadline("Через 3 дня")?.getAttribute("aria-checked")).toBe("true");
    expect(namedDeadline("Без срока")?.getAttribute("aria-checked")).toBe("false");
    await act(async () => namedDeadline("Без срока")?.click());
    expect(latest?.endDate).toBeNull();
    await act(async () => root.render(<Harness disabled />));
    for (const name of ["Без срока", "Через 1 день", "Через 3 дня", "Через 7 дней"]) {
      expect(namedDeadline(name)?.disabled).toBe(true);
      expect(namedDeadline(name)?.getAttribute("aria-disabled")).toBe("true");
    }
    for (const label of ["Несколько вариантов", "Викторина", "Анонимно",
      "Скрывать результаты до завершения", "Перемешивать варианты"]) {
      expect(namedSwitch(label)?.disabled).toBe(true);
      expect(namedSwitch(label)?.getAttribute("aria-disabled")).toBe("true");
    }
    expect(namedField("Вопрос опроса")?.disabled).toBe(true);
  });

  it("draft validation feedback is announced as an alert and reacts to controlled text edits", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => click("Добавить опрос"));
    expect(host.querySelector('[role="alert"][aria-live="polite"]')?.textContent)
      .toBeTruthy();
    await act(async () => {
      setField("Вопрос опроса", "Любите прогулки?");
      setField("Вариант ответа 1", "Да");
      setField("Вариант ответа 2", "Нет");
    });
    expect(latest?.question).toBe("Любите прогулки?");
    expect(latest?.options.map(option => option.text)).toEqual(["Да", "Нет"]);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
