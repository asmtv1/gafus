// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import { adminSections } from "./routes";

const admin = { id: "admin1", username: "admin", role: "ADMIN" };
const moderator = { id: "moderator1", username: "mod", role: "MODERATOR" };
const trainers = [
  {
    userId: "trainer1",
    username: "first",
    fullName: "Первый",
    avatarUrl: null,
    about: null,
    isListed: true,
    cynologistId: "c1",
  },
  {
    userId: "trainer2",
    username: "second",
    fullName: "Второй",
    avatarUrl: null,
    about: null,
    isListed: true,
    cynologistId: "c2",
  },
];
const schedule = {
  availability: { rules: [], dayOffs: [], exceptions: [], slotDurationMin: 30 },
  editableSlots: [],
};

const zeros = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, 0]));
const storage = zeros([
  "totalExamResults",
  "withVideo",
  "withoutVideo",
  "deletedVideos",
  "completedWithVideo",
  "pendingWithVideo",
  "completedOlderThan30Days",
  "pendingOlderThan90Days",
  "deletedByReplacement",
  "deletedByAutoCleanupCompleted",
  "deletedByAutoCleanupPending",
]);
const plans = {
  twoWeeksEnabled: false,
  yookassaTwoWeeksPriceRub: 1185,
  twoWeeksIntervalDays: 14,
  monthlyEnabled: true,
  yookassaMonthlyPriceRub: 1465,
  monthlyIntervalDays: 30,
  threeMonthsEnabled: false,
  yookassaThreeMonthsPriceRub: 2470,
  threeMonthsIntervalDays: 90,
  monthlyAppleProductId: null,
};
const flags = {
  vkLogin: false,
  iosRuCardPayment: false,
  subscriptionPromoCodes: false,
  iosRuCardPaymentHint: false,
  rewardedAds: false,
};
const economy = {
  revision: 1,
  economyEnabled: true,
  earningEnabled: true,
  spendingEnabled: true,
  postReward: 1,
  questionReward: 1,
  answerReward: 1,
  activityLimit: 3,
  activityWindowSeconds: 86400,
  reactionThreshold: 10,
  reactionReward: 1,
  bestAnswerReward: 1,
  courseStepCost: 1,
  miniGuideCost: 1,
  accessDurationSeconds: 604800,
};
const engagementGroup = { sent: 0, clicked: 0, clickRate: 0 };
const engagement = {
  overview: {
    ...zeros([
      "totalCampaigns",
      "activeCampaigns",
      "totalNotificationsSent",
      "clickedNotifications",
      "returnedUsers",
      "unsubscribedUsers",
      "clickRate",
      "returnRate",
    ]),
  },
  byLevel: { level1: engagementGroup, level2: engagementGroup, level3: engagementGroup },
  byType: {
    skillMaintenance: engagementGroup,
    weMissYou: engagementGroup,
    dogDevelopment: engagementGroup,
  },
  recentCampaigns: [],
};
const rewarded = {
  generatedAt: "2026-10-25",
  range: { days: 30, start: "2026-09-25", end: "2026-10-25" },
  settings: { androidEnabled: false, iosEnabled: false, testMode: true },
  today: { sessionsStarted: 0, shown: 0, rewarded: 0, skipped: 0, failed: 0 },
  period: zeros([
    "sessions",
    "uniqueUsers",
    "loaded",
    "shown",
    "rewarded",
    "granted",
    "skipped",
    "failed",
    "uniqueShownUsers",
    "uniqueRewardedUsers",
    "uniqueSkippedUsers",
    "loadRate",
    "showRate",
    "completionRate",
    "grantRate",
    "skipRate",
    "errorRate",
  ]),
  byPlatform: [],
  byTarget: [],
  daily: [],
  failures: [],
};
const profit = {
  from: "2026-10-01",
  to: "2026-10-25",
  today: "2026-10-25",
  totals: { payments: 0, refunds: 0, yookassa: 0, npd: 0, partners: 0, videos: 0, server: 0 },
  profitKopecks: 0,
  incompletePayments: 0,
  missingFees: 0,
  undatedPayments: 0,
  payments: [],
  paymentCount: 0,
  paymentPage: 1,
  videos: [],
  videoCount: 0,
  videoPage: 1,
  pageSize: 20,
  partners: [],
};
function sectionFixture(url: string): unknown {
  if (url.startsWith("/api/v1/admin/moderation/feed/reports"))
    return { items: [], pendingCount: 0, nextCursor: null };
  if (url.startsWith("/api/v1/admin/moderation/questions/reports"))
    return { reports: [], blocks: [], nextPage: null };
  if (url === "/api/v1/admin/mail")
    return {
      updatedAt: "2026-10-25T12:00:00Z",
      summary: zeros([
        "attention",
        "pending",
        "processing",
        "sent24h",
        "unknown",
        "failed",
        "expired",
        "deliveryFailures24h",
      ]),
      outbox: [],
      attempts: [],
      events: [],
    };
  if (url === "/api/v1/admin/media/stats") return storage;
  if (url === "/api/v1/admin/settings/subscriptions") return plans;
  if (url === "/api/v1/admin/partners") return [];
  if (url.startsWith("/api/v1/admin/profit")) return profit;
  if (url === "/api/v1/admin/feature-flags")
    return {
      revision: 1,
      iosReviewVersion: null,
        ota: { required: false, version: null, platform: "all" },
      released: flags,
      review: flags,
      global: { appSubscriptionPaywall: false, appSubscriptionGating: false },
      rewardedAds: {
        androidEnabled: false,
        dailyAdLimit: 0,
        yandexAndroidPlacementId: null,
        yandexIosPlacementId: null,
        testMode: true,
      },
    };
  if (url === "/api/v1/admin/broadcasts/preview")
    return { subscriptions: 0, kind: "raw_subscription_rows" };
  if (url === "/api/v1/admin/analytics/reengagement") return engagement;
  if (url.startsWith("/api/v1/admin/analytics/rewarded-ads")) return rewarded;
  if (url === "/api/v1/gafus/admin/dashboard")
    return {
      settings: economy,
      wallets: { count: 0, outstanding: 0 },
      transactions: [],
      fraudOpen: 0,
    };
  if (url.startsWith("/api/v1/mobile-intro/admin/report"))
    return {
      timeZone: "Europe/Samara",
      range: { start: "2026-09-30T20:00:00Z", end: "2026-10-25T20:00:00Z" },
      generatedAt: "2026-10-25T12:00:00Z",
      openings: 0,
      completed: 0,
      skipped: 0,
      registered: 0,
      loggedIn: 0,
      pendingAuth: 0,
    };
  if (url.startsWith("/api/v1/admin/app-subscriptions"))
    return {
      role: "ADMIN",
      dashboard: {},
      paymentHistory: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
      promoCodes: null,
      npd: null,
    };
  if (url === "/api/v1/consultations/admin/bookings") return [];
  return {};
}

let root: Root;
let host: HTMLDivElement;
let calls: string[];
let currentActor = admin;
let expireUsers = false;

function reply(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status === 200 ? { success: true, data } : { success: false, code: "UNAUTHORIZED" },
    ),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

beforeEach(() => {
  calls = [];
  currentActor = admin;
  expireUsers = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url === "/api/v1/auth/me") return reply(currentActor);
      if (url.startsWith("/api/v1/admin/consultations/schedules/")) return reply(schedule);
      if (url === "/api/v1/consultations/admin/cynologists") return reply(trainers);
      if (url.startsWith("/api/v1/admin/users/") && url.endsWith("/app-subscription"))
        return reply({ subscription: null, user: { username: "client" } });
      if (url === "/api/v1/admin/users")
        return expireUsers ? reply(null, 401) : reply({ users: [], freePartnerPromoCodes: [] });
      return reply(sectionFixture(url));
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

async function mount(path: string) {
  window.history.replaceState(null, "", path);
  await act(async () => {
    root.render(<App />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}
async function clickButton(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(button, `button ${label}`).toBeTruthy();
  await act(async () => {
    button!.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("admin live application SPA flows with isolated API fixtures", () => {
  it("canonicalizes old deep links on mount and browser Back while preserving filters", async () => {
    await mount("/main-panel/app-subscriptions?tab=npd&npdPage=2");
    expect(window.location.pathname + window.location.search)
      .toBe("/app-subscriptions?tab=npd&npdPage=2");
    expect(calls).toContain("/api/v1/admin/app-subscriptions?tab=npd&npdPage=2");
    await act(async () => {
      window.history.replaceState(null, "", "/main-panel/profit?from=2026-10-01&to=2026-10-15");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(window.location.pathname + window.location.search)
      .toBe("/profit?from=2026-10-01&to=2026-10-15");
    expect(calls).toContain("/api/v1/admin/profit?from=2026-10-01&to=2026-10-15");
  });

  it("opens direct short dashboard and nested URLs without additional auth checks", async () => {
    await mount("/users/user1/app-subscription");
    expect(window.location.pathname).toBe("/users/user1/app-subscription");
    expect(calls).toContain("/api/v1/admin/users/user1/app-subscription");
    expect(calls).not.toContain("/api/v1/admin/users");
  });

  it("shares a single auth check across StrictMode effect replay", async () => {
    window.history.replaceState(null, "", "/main-panel/users");
    await act(async () => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls.filter((url) => url === "/api/v1/auth/me")).toHaveLength(1);
  });

  it("restores direct Next schedule link, picker and a different trainer", async () => {
    await mount("/main-panel/consultations/trainers-schedules?trainerId=trainer2");
    expect(
      calls.some((url) => url.startsWith("/api/v1/admin/consultations/schedules/trainer2?")),
    ).toBe(true);
    expect(host.textContent).toContain("Кинолог: trainer2");
    await clickButton("Выбрать другого кинолога");
    expect(window.location.search).toBe("");
    expect(host.textContent).toContain("Первый");
    const choose = [...host.querySelectorAll(".trainer-row")].find((r) =>
      r.textContent?.includes("Первый"),
    );
    expect(choose).toBeTruthy();
    await act(async () => {
      choose!.querySelector("button")!.click();
    });
    expect(window.location.search).toBe("?trainerId=trainer1");
    expect(
      calls.some((url) => url.startsWith("/api/v1/admin/consultations/schedules/trainer1?")),
    ).toBe(true);
  });

  it("opens every one of the 18 menu routes and sends the matching authorized GET", async () => {
    await mount("/main-panel/users");
    for (const section of adminSections) {
      const target = host.querySelector<HTMLAnchorElement>(
        `nav a[href="${section.path.slice("/main-panel".length)}"]`,
      );
      expect(target, `navigation for ${section.key}`).toBeTruthy();
      const before = calls.length;
      await act(async () => {
        target!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(window.location.pathname, `pathname ${section.key}`).toBe(
        section.path.slice("/main-panel".length),
      );
      expect(host.querySelector(".page-heading h1")?.textContent, `heading ${section.key}`).toBe(
        section.title,
      );
      expect(host.textContent, `rendered DTO for ${section.key}`).not.toMatch(
        /Некорректный (формат|ответ)|Неверный (формат|список)/,
      );
      if (section.key !== "users") {
        // A special view can replace the URL with its own filtered GET.
        const fresh = calls.slice(before);
        expect(
          fresh.some((url) => url.startsWith("/api/v1/")),
          `live Hono GET ${section.key}`,
        ).toBe(true);
      }
    }
  });

  it("loads Next mobile-intro direct date URL on the first Hono GET and restores browser history", async () => {
    await mount("/main-panel/mobile-intro?start=2026-10-03&end=2026-10-15");
    const first = "/api/v1/mobile-intro/admin/report?start=2026-10-02T20%3A00%3A00.000Z&end=2026-10-15T20%3A00%3A00.000Z";
    expect(calls.filter(url => url.startsWith("/api/v1/mobile-intro/admin/report")))
      .toEqual([first]);
    await act(async () => {
      window.history.replaceState(null, "", "/main-panel/mobile-intro?start=2026-10-07&end=2026-10-07");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(calls).toContain(
      "/api/v1/mobile-intro/admin/report?start=2026-10-06T20%3A00%3A00.000Z&end=2026-10-07T20%3A00%3A00.000Z",
    );
  });

  it("uses Next subscription tab and filters from direct URL, then supports tab switching and browser back", async () => {
    await mount("/main-panel/app-subscriptions?tab=npd&npdStatus=FAILED&npdPage=2&npdSearch=receipt");
    expect(calls).toContain("/api/v1/admin/app-subscriptions?tab=npd&npdPage=2&npdStatus=FAILED&npdSearch=receipt");
    const npdButton = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Чеки НПД");
    expect(npdButton?.getAttribute("aria-pressed")).toBe("true");
    await clickButton("Промокоды");
    expect(window.location.pathname + window.location.search).toBe("/app-subscriptions?tab=promo-codes");
    expect(calls).toContain("/api/v1/admin/app-subscriptions?tab=promo-codes");
    const promoButton = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Промокоды");
    expect(promoButton?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      window.history.replaceState(null, "", "/main-panel/app-subscriptions?tab=payments&paymentPage=3&paymentStatus=SUCCEEDED");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(calls).toContain("/api/v1/admin/app-subscriptions?tab=payments&paymentPage=3&paymentStatus=SUCCEEDED");
    expect([...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Оплаты")
      ?.getAttribute("aria-pressed")).toBe("true");
  });

  it("profit report restores Next period/pagination direct URL and updates on successful read", async () => {
    await mount("/main-panel/profit?from=2026-09-01&to=2026-10-20&paymentPage=2&videoPage=3");
    expect(calls).toContain(
      "/api/v1/admin/profit?from=2026-09-01&to=2026-10-20&paymentPage=2&videoPage=3",
    );
    await clickButton("С начала учёта");
    expect(calls).toContain(
      "/api/v1/admin/profit?from=2026-09-01&to=2026-10-25&paymentPage=1&videoPage=1",
    );
    expect(window.location.pathname + window.location.search)
      .toBe("/profit?from=2026-09-01&to=2026-10-25&paymentPage=1&videoPage=1");
    await act(async () => {
      window.history.replaceState(null, "", "/main-panel/profit?from=2026-10-01&to=2026-10-15&videoPage=4");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(calls).toContain("/api/v1/admin/profit?from=2026-10-01&to=2026-10-15&videoPage=4");
  });

  it("uses Next rewarded-ads ?period direct links and respects browser history", async () => {
    await mount("/main-panel/rewarded-ads?period=7");
    expect(calls).toContain("/api/v1/admin/analytics/rewarded-ads?days=7");
    expect([...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.trim() === "7 дней")?.getAttribute("aria-pressed"))
      .toBe("true");
    await clickButton("90 дней");
    expect(window.location.pathname + window.location.search).toBe(
      "/rewarded-ads?period=90",
    );
    expect(calls).toContain("/api/v1/admin/analytics/rewarded-ads?days=90");
    await act(async () => {
      window.history.replaceState(null, "", "/main-panel/rewarded-ads?period=30");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(calls).toContain("/api/v1/admin/analytics/rewarded-ads?days=30");
  });

  it("does not forward unsafe or invalid subscription search parameters to Hono", async () => {
    await mount("/main-panel/app-subscriptions?tab=../../billing&npdPage=10001&paymentPage=-1&secret=1");
    expect(calls).toContain("/api/v1/admin/app-subscriptions?tab=payments");
    expect(calls.some((url) => url.includes("secret=1"))).toBe(false);
    expect(calls.some((url) => url.includes("npdPage=10001"))).toBe(false);
  });

  it("loads only the selected user for a deep subscription link, not the entire user list", async () => {
    await mount("/main-panel/users/user1/app-subscription");
    expect(calls).toContain("/api/v1/admin/users/user1/app-subscription");
    expect(calls).not.toContain("/api/v1/admin/users");
    expect(host.textContent).toContain("Подписка отдельного пользователя");
  });

  it("restores Next /admin and /media cross-navigation without privileged side effects", async () => {
    await mount("/main-panel/admin");
    const mediaLink = [...host.querySelectorAll<HTMLAnchorElement>("main a")]
      .find((node) => node.textContent?.includes("Медиа и хранение — отдельный раздел"));
    expect(mediaLink).toBeDefined();
    await act(async () => mediaLink?.click());
    expect(window.location.pathname).toBe("/media");
    expect(calls).toContain("/api/v1/admin/media/stats");
    const adminLink = [...host.querySelectorAll<HTMLAnchorElement>("main a")]
      .find((node) => node.textContent?.includes("Управление системой и кэшем"));
    expect(adminLink).toBeDefined();
    await act(async () => adminLink?.click());
    expect(window.location.pathname).toBe("/admin");
  });

  it("shows Next premium pricing read-only to MODERATOR without a privileged mail request", async () => {
    currentActor = moderator;
    await mount("/main-panel/admin");
    expect(host.textContent).toContain("Настройки тарифов Premium");
    expect(host.textContent).toContain("Только ADMIN может изменять настройки тарифов");
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    expect(host.textContent).toContain("Обновить кэш курсов");
    expect(calls).toContain("/api/v1/admin/settings/subscriptions");
    expect(calls).not.toContain("/api/v1/admin/mail/alerts");
  });

  it("does not request restricted endpoints for a moderator deep link", async () => {
    currentActor = moderator;
    await mount("/main-panel/consultations/trainers-schedules?trainerId=trainer1");
    expect(host.textContent).toContain("Недостаточно прав");
    expect(
      host.querySelector('nav a[href="/main-panel/consultations/trainers-schedules"]'),
    ).toBeNull();
    expect(calls.some((url) => url.includes("/consultations/schedules/"))).toBe(false);
  });

  it("drops the expired session after a protected data request returns 401", async () => {
    expireUsers = true;
    await mount("/main-panel/users");
    expect(host.textContent).toContain("Войдите под учётной записью");
    expect(host.querySelector('input[type="password"]')).toBeTruthy();
  });
});
