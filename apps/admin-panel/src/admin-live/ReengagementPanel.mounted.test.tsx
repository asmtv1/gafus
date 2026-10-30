// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReengagementPanel } from "./AnalyticsPanels";
import { AdminHttpError } from "./api";

const api = vi.hoisted(() => ({ requestAdmin: vi.fn() }));
vi.mock("./api", () => ({
  requestAdmin: api.requestAdmin,
  AdminHttpError: class AdminHttpError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  },
}));

const metrics = {
  overview: {
    totalCampaigns: 0, activeCampaigns: 0, totalNotificationsSent: 0,
    clickedNotifications: 0, returnedUsers: 0, unsubscribedUsers: 0,
    clickRate: 0, returnRate: 0,
  },
  byLevel: {}, byType: {}, recentCampaigns: [],
};
let host: HTMLDivElement;
let root: Root;
const saved = vi.fn();
const runUrl = "/api/v1/admin/reengagement/run";

async function mount() {
  await act(async () => root.render(<ReengagementPanel source={metrics} onSaved={saved} />));
}
async function typeConfirmation() {
  const input = [...host.querySelectorAll<HTMLInputElement>("input")]
    .find(node => node.closest("form") !== null);
  expect(input).toBeDefined();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "ЗАПУСТИТЬ");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function launch() {
  const form = host.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
function launchButton() {
  return [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent?.includes("Запустить планировщик"));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  api.requestAdmin.mockReset();
  saved.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Reengagement manual trigger: non-duplicate outcome handling", () => {
  it("blocks a blind repeat when the scheduler might have accepted the first POST", async () => {
    api.requestAdmin.mockRejectedValueOnce(
      new AdminHttpError(503, "SCHEDULER_UNAVAILABLE", "unavailable"),
    );
    await mount();
    await typeConfirmation();
    await launch();
    expect(api.requestAdmin).toHaveBeenCalledExactlyOnceWith(runUrl, {
      method: "POST", body: { confirmation: "RUN_REENGAGEMENT" },
    });
    expect(host.textContent).toContain("Неизвестен результат запуска");
    expect(launchButton()?.disabled).toBe(true);
    await typeConfirmation();
    await launch();
    expect(api.requestAdmin).toHaveBeenCalledTimes(1);
  });

  it("allows a new deliberate attempt after a definite 409 rejection", async () => {
    api.requestAdmin.mockRejectedValueOnce(
      new AdminHttpError(409, "ALREADY_RUNNING", "Already running"),
    );
    api.requestAdmin.mockResolvedValueOnce({
      newCampaigns: 1, scheduledNotifications: 2, closedCampaigns: 0,
    });
    api.requestAdmin.mockResolvedValueOnce(metrics);
    await mount();
    await typeConfirmation();
    await launch();
    expect(host.textContent).toContain("Already running");
    expect(launchButton()?.disabled).toBe(false);
    await launch();
    expect(api.requestAdmin).toHaveBeenCalledTimes(3);
    expect(host.textContent).toContain("Новых кампаний: 1");
  });

  it("preserves a confirmed scheduler receipt even if follow-up metrics GET fails", async () => {
    api.requestAdmin.mockResolvedValueOnce({
      newCampaigns: 1, scheduledNotifications: 2, closedCampaigns: 0,
    });
    api.requestAdmin.mockRejectedValueOnce(new Error("metrics offline"));
    await mount();
    await typeConfirmation();
    await launch();
    expect(host.textContent).toContain("Новых кампаний: 1");
    expect(host.textContent).not.toContain("metrics offline");
    expect(api.requestAdmin).toHaveBeenNthCalledWith(2, "/api/v1/admin/analytics/reengagement");
  });
});
