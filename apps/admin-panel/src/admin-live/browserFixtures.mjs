// Isolated read-only browser QA fixtures. Do not use in production UI.
const zeros = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));
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
export function sectionFixture(url) {
  if (url === "/api/v1/admin/partners/qa_partner") return {
    id:"qa_partner", username:"synthetic_partner", fullName:"Тестовый партнёр",
    email:null, referralCode:"QA_ONLY", referrals:[],commissions:[],payouts:[],
    availableRub:0, earnedRub:0, reservedRub:0, availableKopecks:0, isActive:true,
  };
  if (url === "/api/v1/admin/users/qa_user/app-subscription") return {
    user: { id:"qa_user", username:"synthetic_user" }, manualSubscription:null,
    subscription:null, history:[],
  };
  if (url === "/api/v1/admin/users") return {users:[],freePartnerPromoCodes:[]};
  if (url === "/api/v1/consultations/admin/cynologists") return [];
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
