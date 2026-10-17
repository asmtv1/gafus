// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GafusHistoryEntry, GafusStatusDto } from "@gafus/types";

vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  View: ({
    children,
    style,
  }: {
    children?: React.ReactNode;
    style?: { minHeight?: number; paddingVertical?: number; backgroundColor?: string };
  }) => (
    <div
      data-min-height={style?.minHeight}
      data-padding-vertical={style?.paddingVertical}
      data-background={style?.backgroundColor}
    >{children}</div>
  ),
  Text: ({
    children,
    accessibilityLabel,
    numberOfLines,
  }: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
    numberOfLines?: number;
  }) => <span aria-label={accessibilityLabel} data-lines={numberOfLines}>{children}</span>,
  Pressable: ({
    children,
    accessibilityLabel,
    disabled,
    onPress,
    accessibilityState,
  }: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
    disabled?: boolean;
    onPress: () => void;
    accessibilityState?: { expanded?: boolean };
  }) => (
    <button
      aria-label={accessibilityLabel}
      aria-expanded={accessibilityState?.expanded}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
}));
vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: ({ name }: { name: string }) => <i data-icon={name} />,
}));
vi.mock("@/shared/config", () => ({
  COLORS: { primary: "#465429", text: "#352e2e" },
  FONTS: {
    montserrat: "Montserrat",
    montserratMedium: "MontserratMedium",
    montserratBold: "MontserratBold",
  },
}));

import { GafusWalletOverview } from "./GafusWalletOverview";

const status: GafusStatusDto = {
  serverNow: "2026-10-15T11:00:00Z",
  wallet: { balance: 6 },
  activity: {
    earned: 3, limit: 3, remaining: 0, windowSeconds: 86400, nextCapacityAt: null,
  },
  rules: {
    postReward: 1, questionReward: 1, answerReward: 1,
    reactionThreshold: 5, reactionReward: 1, bestAnswerReward: 1,
    courseStepCost: 1, miniGuideCost: 1, accessDurationSeconds: 604800,
  },
  enabled: { economy: true, earning: true, spending: true },
  settingsRevision: 1,
};

const history: GafusHistoryEntry[] = [
  {
    id: "transaction-1", kind: "EARN", rewardKind: "POST_PUBLISHED",
    delta: 1, balanceAfter: 6, createdAt: "2026-10-15T10:34:40Z",
    sourceEntityType: null, sourceEntityId: null, targetKey: null,
  },
  {
    id: "transaction-2", kind: "SPEND", rewardKind: null,
    delta: -1, balanceAfter: 5, createdAt: "2026-10-14T14:14:00Z",
    sourceEntityType: null, sourceEntityId: null, targetKey: null,
  },
];

const more = vi.fn();
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  more.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(
  data = status,
  entries = history,
  canLoadMore = false,
  loadingMore = false,
) {
  await act(async () => root.render(
    <GafusWalletOverview
      data={data}
      history={entries}
      canLoadMore={canLoadMore}
      loadingMore={loadingMore}
      onLoadMore={more}
    />,
  ));
}

describe("Compact Gafus wallet mobile layout", () => {
  it("shows a small balance tile and one grouped earning/spending block", async () => {
    await render();
    expect(host.querySelectorAll('[data-background="#FFF3D5"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-padding-vertical="3"]')).toHaveLength(1);
    expect(host.querySelector('[aria-label="Баланс: 6 Гафусов"]')).not.toBeNull();
    expect(host.textContent).toContain("Внутренняя валюта");
    expect(host.textContent).toContain("За активность");
    expect(host.textContent).toContain("Осталось за обычную активность: 0");
    expect(host.textContent).toContain("Бонусы сверх лимита");
    expect(host.textContent).not.toContain("за каждые 5 лайков");
    expect(host.textContent).toContain("На обучение");
    expect(host.textContent).toContain("Доступ на 7 дней");
    expect(host.textContent).not.toContain("Смотреть мини-гайды");
    expect(host.textContent).not.toContain("Мои Гафусы");
  });

  it("keeps bonus earning rules accessible on demand without making the page tall", async () => {
    await render();
    const toggle = host.querySelector<HTMLButtonElement>(
      '[aria-label="Бонусные Гафусы сверх лимита"]',
    );
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(host.textContent).not.toContain("за каждые 5 лайков");
    await act(async () => toggle?.click());
    expect(host.textContent).toContain("за каждые 5 лайков");
    expect(host.textContent).toContain("разных пользователей");
    expect(host.textContent).toContain("ответ в «Вопросах» выберут лучшим");
    await act(async () => toggle?.click());
    expect(host.textContent).not.toContain("за каждые 5 лайков");
  });

  it("uses compact history rows and keeps positive/negative transactions distinct", async () => {
    await render();
    expect(host.querySelectorAll('[data-min-height="48"]')).toHaveLength(2);
    expect(host.textContent).toContain("История операций");
    expect(host.textContent).toContain("Публикация");
    expect(host.textContent).toContain("Открытие обучения");
    expect(host.querySelector('[aria-label="Изменение баланса: +1 Гафусов"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Изменение баланса: -1 Гафусов"]')).not.toBeNull();
    expect(host.textContent).not.toContain("14:40");
    expect(host.textContent).not.toContain(":40");
  });

  it("renders the empty state and disabled-economy note without changing their meaning", async () => {
    await render({
      ...status,
      enabled: { ...status.enabled, economy: false },
    }, []);
    expect(host.textContent).toContain("Система мотивации пока не включена");
    expect(host.textContent).toContain("Пока нет операций");
    expect(host.querySelectorAll('[data-min-height="48"]')).toHaveLength(0);
  });

  it("loads more history only when requested, and disables the control while loading", async () => {
    await render(status, history, true);
    const button = host.querySelector<HTMLButtonElement>(
      '[aria-label="Показать ещё операции"]',
    );
    expect(button?.disabled).toBe(false);
    await act(async () => button?.click());
    expect(more).toHaveBeenCalledTimes(1);

    await render(status, history, true, true);
    const loadingButton = host.querySelector<HTMLButtonElement>(
      '[aria-label="Показать ещё операции"]',
    );
    expect(loadingButton?.disabled).toBe(true);
    expect(loadingButton?.textContent).toContain("Загрузка");
    await act(async () => loadingButton?.click());
    expect(more).toHaveBeenCalledTimes(1);
  });
});
