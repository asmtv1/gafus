// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetDocumentDto } from "@gafus/types";

vi.mock("@gafus/types", () => ({
  getPetDocumentDisplayName: (name: string) => name.replace(/\.[^.]+$/, ""),
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children, numberOfLines }: { children: React.ReactNode; numberOfLines?: number }) => (
    <span data-lines={numberOfLines}>{children}</span>
  ),
  Pressable: ({
    children, onPress, accessibilityLabel, accessibilityState, disabled, style,
  }: {
    children: React.ReactNode;
    onPress: () => void;
    accessibilityLabel?: string;
    accessibilityState?: { expanded?: boolean };
    disabled?: boolean;
    style?: object | ((state: { pressed: boolean }) => object);
  }) => {
    const resolved = typeof style === "function" ? style({ pressed: false }) : style;
    const styles = Array.isArray(resolved) ? resolved : [resolved];
    const minHeight = styles.find(item => item?.minHeight)?.minHeight;
    const height = styles.find(item => item?.height)?.height;
    return (
      <button
        type="button"
        aria-label={accessibilityLabel}
        aria-expanded={accessibilityState?.expanded}
        disabled={disabled}
        onClick={onPress}
        data-min-height={minHeight}
        data-height={height}
      >{children}</button>
    );
  },
}));
vi.mock("expo-image", () => ({
  Image: ({ style }: { style: { width: number; height: number } }) => (
    <div data-thumbnail-size={`${style.width}x${style.height}`} />
  ),
}));
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) => <i data-icon={name} />,
}));
vi.mock("@/shared/config", () => ({
  COLORS: {
    primary: "#465429", text: "#352e2e", textSecondary: "#6c6c6c",
    cardBackground: "#eee",
  },
  FONTS: { montserrat: "Montserrat", montserratMedium: "MontserratMedium" },
  SPACING: { xs: 4 },
}));

import { PetDocumentsList } from "./PetDocumentsList";

const callbacks = {
  onOpen: vi.fn(), onRename: vi.fn(), onShare: vi.fn(),
  onDownload: vi.fn(), onDelete: vi.fn(),
};
const documents = [
  {
    id: "doc-photo", name: "vetpassport.jpg", mimeType: "image/jpeg",
    url: "https://example.test/vetpassport.jpg", createdAt: "2026-10-14T10:00:00Z",
  },
  {
    id: "doc-pdf", name: "analysis.pdf", mimeType: "application/pdf",
    url: "https://example.test/analysis.pdf", createdAt: "2026-10-12T10:00:00Z",
  },
] as PetDocumentDto[];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.values(callbacks).forEach(fn => fn.mockClear());
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(docs = documents, busy = false) {
  await act(async () => root.render(<PetDocumentsList documents={docs} busy={busy} {...callbacks} />));
}
async function tap(label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button, `Missing: ${label}`).not.toBeNull();
  await act(async () => button?.click());
}

describe("PetDocumentsList", () => {
  it("renders two compact, accessible rows with file previews and no visible bulk actions", async () => {
    await render();
    expect(host.querySelector('[data-thumbnail-size="50x50"]')).not.toBeNull();
    expect(host.querySelector('[data-icon="file-pdf-box"]')).not.toBeNull();
    expect(host.textContent).toContain("vetpassport");
    expect(host.textContent).toContain("analysis");
    expect(host.textContent).toContain("2026");
    expect(host.querySelectorAll('button[aria-label^="Открыть документ"]')).toHaveLength(2);
    expect(host.querySelectorAll('button[aria-label^="Действия с документом"]')).toHaveLength(2);
    expect(host.textContent).not.toContain("Удалить");
    expect(host.querySelectorAll('span[data-lines="2"]')).toHaveLength(2);
    expect(host.querySelectorAll('button[data-min-height="72"]')).toHaveLength(2);
    expect(host.querySelectorAll('button[data-height="48"]')).toHaveLength(2);
  });

  it("opens a document on the row but allows the overflow menu to expand separately", async () => {
    await render();
    await tap("Открыть документ vetpassport");
    expect(callbacks.onOpen).toHaveBeenCalledWith(documents[0]);
    await tap("Действия с документом vetpassport");
    expect(host.textContent).toContain("Переименовать");
    expect(host.textContent).toContain("Поделиться");
    expect(host.textContent).toContain("Скачать");
    expect(host.textContent).toContain("Удалить");
    expect(host.querySelectorAll('button[data-min-height="44"]')).toHaveLength(4);
    await tap("Действия с документом analysis");
    expect(host.querySelector('button[aria-label="Удалить: vetpassport"]')).toBeNull();
    await tap("Скачать: analysis");
    expect(callbacks.onDownload).toHaveBeenCalledWith(documents[1]);
    expect(host.textContent).not.toContain("Удалить");
    expect(callbacks.onOpen).toHaveBeenCalledTimes(1);
  });

  it("preserves rename, share and delete through secondary actions", async () => {
    await render();
    for (const [label, callback] of [
      ["Переименовать", callbacks.onRename],
      ["Поделиться", callbacks.onShare],
      ["Удалить", callbacks.onDelete],
    ] as const) {
      await tap("Действия с документом vetpassport");
      await tap(`${label}: vetpassport`);
      expect(callback).toHaveBeenCalledWith(documents[0]);
    }
    expect(callbacks.onOpen).not.toHaveBeenCalled();
  });

  it("disables secondary destructive actions while a mutation is pending", async () => {
    await render(documents, true);
    await tap("Действия с документом analysis");
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Удалить: analysis"]',
    );
    expect(button?.disabled).toBe(true);
    await act(async () => button?.click());
    expect(callbacks.onDelete).not.toHaveBeenCalled();
  });
});
