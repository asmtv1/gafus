// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { RewardedAdsPanel } from "./AnalyticsPanels";

const key = "gafus:admin:rewarded-ads:ecpm-rub:v1";
const metrics = { sessions: 10, shown: 100, rewarded: 50, skipped: 2, failed: 0,
  loaded: 0, granted: 0, completionRate: 50, skipRate: 2, uniqueUsers: 8 };
const dashboard = {
  generatedAt: "2026-10-25T12:00:00Z",
  range: { days: 30, start: "2026-09-25", end: "2026-10-25" },
  settings: { androidEnabled: false, iosEnabled: false, testMode: false },
  today: {shown: 10, rewarded: 5, skipped: 1, failed: 0, sessionsStarted: 12},
  period: metrics,
  byPlatform: [], byTarget: [], daily: [], failures: [],
};
let root: ReturnType<typeof createRoot>;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); window.localStorage.clear();
});
async function mount(source: unknown = dashboard) {
  await act(async () => root.render(<RewardedAdsPanel source={source} />));
}
function input() { return host.querySelector<HTMLInputElement>('input[type="number"]'); }

describe("Next rewarded ads estimate persistence without server mutation", () => {
  it("restores the original Next local storage eCPM across SPA mounts", async () => {
    window.localStorage.setItem(key, "750");
    await mount();
    expect(input()?.value).toBe("750");
    expect(host.textContent).toContain("Архивная аналитика");
    expect(host.textContent).toContain("75,00");
  });
  it("ignores invalid local storage and does not allow a negative estimate", async () => {
    window.localStorage.setItem(key, "-42");
    await mount();
    expect(input()?.value).toBe("500");
    const element = input();
    await act(async () => {
      if (element) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(element,"600");
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(input()?.value).toBe("600");
    expect(window.localStorage.getItem(key)).toBe("600");
  });
});


describe("historical Next monitoring parity without restoring the retired reward economy", () => {
  it("renders 5 funnel stages, platform status, per-target revenue and failure reasons", async () => {
    await mount({
      ...dashboard,
      settings: { androidEnabled: true, iosEnabled: false, testMode: true },
      period: { ...metrics, loaded: 9, shown: 8, rewarded: 6, granted: 6,
        loadRate: 90, showRate: 88.9, completionRate: 75, grantRate: 100 },
      today: { ...dashboard.today, uniqueRewardedUsers: 3, uniqueShownUsers: 8,
        uniqueSkippedUsers: 1, granted: 5 },
      byTarget: [{ targetType: "COURSE_STEP", targetId: "step-1", title: "Урок с собакой",
        context: "Тестовый курс", ...metrics, shown: 10, rewarded: 5, completionRate: 50 }],
      failures: [{ code: "SDK_TIMEOUT", count: 2 }],
      daily: [{ date: "2026-10-25", sessions: 10, shown: 8, rewarded: 6,
        skipped: 1, failed: 0, completionRate: 75 }],
    });
    expect(host.textContent).toContain("Тестовый режим");
    expect(host.textContent).toContain("Android: включена");
    expect(host.textContent).toContain("Реклама загрузилась");
    expect(host.textContent).toContain("Доступ выдан");
    expect(host.textContent).toContain("Урок с собакой");
    expect(host.textContent).toContain("SDK_TIMEOUT: 2");
    expect(host.textContent).toContain("Досмотры по дням");
    expect(host.querySelectorAll('[role="progressbar"]').length).toBe(6);
    expect(host.querySelector("button")).toBeNull();
  });
  it("handles an invalid dashboard safely instead of rendering money or PII", async () => {
    await mount({ ...dashboard, period: null });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Неверный формат");
    expect(host.querySelector("table")).toBeNull();
  });
});
