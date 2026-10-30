import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedModerationPanel, QuestionsModerationPanel } from "./ModerationPanels";
import { UsersPanel } from "./UserManagement";
import { MailPanel, StoragePanel } from "./SystemPanels";
import { PricingEditor, FeatureFlagsEditor } from "./SettingsEditors";
import { PartnersPanel } from "./PartnersPanel";
import { ProfitReport } from "./ProfitReport";
import { BroadcastPanel, ReengagementPanel, RewardedAdsPanel } from "./AnalyticsPanels";
import { GafusPanel } from "./GafusPanel";
import { MobileIntroPanel } from "./MobileIntroPanel";
import { SubscriptionPanel } from "./SubscriptionPanels";
import { Cynologists, Bookings } from "./Consultations";
import { TrainerPicker } from "./ScheduleEditor";

const noop = () => undefined;
const noKey = () => undefined;
const rflag = {
  vkLogin: false,
  iosRuCardPayment: false,
  subscriptionPromoCodes: false,
  iosRuCardPaymentHint: false,
  rewardedAds: false,
};
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
const settings = {
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
const mockProfit = {
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
const rewardMetrics = {
  sessions: 0,
  uniqueUsers: 0,
  loaded: 0,
  shown: 0,
  rewarded: 0,
  granted: 0,
  skipped: 0,
  failed: 0,
  uniqueShownUsers: 0,
  uniqueRewardedUsers: 0,
  uniqueSkippedUsers: 0,
  loadRate: 0,
  showRate: 0,
  completionRate: 0,
  grantRate: 0,
  skipRate: 0,
  errorRate: 0,
};
const storage = {
  totalExamResults: 0,
  withVideo: 0,
  withoutVideo: 0,
  deletedVideos: 0,
  completedWithVideo: 0,
  pendingWithVideo: 0,
  completedOlderThan30Days: 0,
  pendingOlderThan90Days: 0,
  deletedByReplacement: 0,
  deletedByAutoCleanupCompleted: 0,
  deletedByAutoCleanupPending: 0,
};
const overview = {
  totalCampaigns: 0,
  activeCampaigns: 0,
  totalNotificationsSent: 0,
  clickedNotifications: 0,
  returnedUsers: 0,
  unsubscribedUsers: 0,
  clickRate: 0,
  returnRate: 0,
};
const byLevel = {
  level1: { sent: 0, clicked: 0, clickRate: 0 },
  level2: { sent: 0, clicked: 0, clickRate: 0 },
  level3: { sent: 0, clicked: 0, clickRate: 0 },
};

const sections = [
  [
    "feed-moderation",
    <FeedModerationPanel
      source={{ items: [], pendingCount: 0, nextCursor: null }}
      onSaved={noop}
    />,
    "Модерация моментов",
  ],
  [
    "questions",
    <QuestionsModerationPanel
      source={{ reports: [], blocks: [], nextPage: null }}
      onSaved={noop}
    />,
    "модерация",
  ],
  [
    "users",
    <UsersPanel
      source={{ users: [], freePartnerPromoCodes: [] }}
      actorRole="ADMIN"
      actorId="admin"
      onSaved={noop}
    />,
    "Пользователи платформы",
  ],
  [
    "mail",
    <MailPanel
      data={{
        updatedAt: "2026-10-25T12:00:00.000Z",
        summary: {
          attention: 0,
          pending: 0,
          processing: 0,
          sent24h: 0,
          unknown: 0,
          failed: 0,
          expired: 0,
          deliveryFailures24h: 0,
        },
        outbox: [],
        attempts: [],
        events: [],
      }}
      onRefresh={noop}
    />,
    "Почта и алерты",
  ],
  ["media", <StoragePanel data={storage} />, "Управление хранилищем"],
  ["admin", <PricingEditor source={plans} onSaved={noop} />, "Настройки тарифов Premium"],
  [
    "partners",
    <PartnersPanel source={[]} onSaved={noop} initialPartnerId={null} onNavigate={noKey} />,
    "Партнёрская программа",
  ],
  ["profit", <ProfitReport source={mockProfit} />, "Прибыль GAFUS"],
  [
    "feature-flags",
    <FeatureFlagsEditor
      source={{
        revision: 1,
        iosReviewVersion: null,
        released: rflag,
        review: rflag,
        global: { appSubscriptionPaywall: false, appSubscriptionGating: false },
        rewardedAds: {
          androidEnabled: false,
          dailyAdLimit: 0,
          yandexAndroidPlacementId: null,
          yandexIosPlacementId: null,
          testMode: true,
        },
      }}
      onSaved={noop}
    />,
    "Флаги мобильного приложения",
  ],
  [
    "broadcasts",
    <BroadcastPanel source={{ subscriptions: 0, kind: "raw_subscription_rows" }} />,
    "Массовая push-рассылка",
  ],
  [
    "reengagement",
    <ReengagementPanel
      source={{
        overview,
        byLevel,
        byType: {
          skillMaintenance: { sent: 0, clicked: 0, clickRate: 0 },
          weMissYou: { sent: 0, clicked: 0, clickRate: 0 },
          dogDevelopment: { sent: 0, clicked: 0, clickRate: 0 },
        },
        recentCampaigns: [],
      }}
      onSaved={noop}
    />,
    "Мониторинг возврата",
  ],
  [
    "rewarded-ads",
    <RewardedAdsPanel
      source={{
        generatedAt: "2026-10-25",
        range: { days: 30, start: "2026-09-25", end: "2026-10-25" },
        settings: { androidEnabled: false, iosEnabled: false, testMode: true },
        today: { sessionsStarted: 0, shown: 0, rewarded: 0, skipped: 0, failed: 0 },
        period: rewardMetrics,
        byPlatform: [],
        byTarget: [],
        daily: [],
        failures: [],
      }}
    />,
    "Архивная аналитика rewarded",
  ],
  [
    "gafus",
    <GafusPanel
      source={{ settings, wallets: { count: 0, outstanding: 0 }, transactions: [], fraudOpen: 0 }}
      tab="dashboard"
      onSaved={noop}
    />,
    "Гафусы — управление экономикой",
  ],
  [
    "mobile-intro",
    <MobileIntroPanel
      data={{
        timeZone: "Europe/Samara",
        range: { start: "2026-09-30T20:00:00Z", end: "2026-10-25T20:00:00Z" },
        generatedAt: "2026-10-25T12:00:00Z",
        openings: 0,
        completed: 0,
        skipped: 0,
        registered: 0,
        loggedIn: 0,
        pendingAuth: 0,
      }}
      range={{ startDate: "2026-10-01", endDate: "2026-10-25" }}
      onApply={noop}
    />,
    "Первый запуск мобильного",
  ],
  [
    "app-subscriptions",
    <SubscriptionPanel
      source={{
        role: "ADMIN",
        dashboard: {},
        paymentHistory: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
        promoCodes: null,
        npd: null,
      }}
      tab="payments"
      canManage
      onSaved={noop}
    />,
    "История оплат",
  ],
  ["consultations", <Cynologists source={[]} onSaved={noop} />, "Каталог кинологов"],
  ["bookings", <Bookings source={[]} />, "Все брони консультаций"],
  ["trainers-schedules", <TrainerPicker source={[]} onSelect={noop} />, "Выберите кинолога"],
] as const;

describe("18 isolated Vite Admin section server DTO rendering", () => {
  it("fixtures cover each requested route exactly once", () => {
    expect(sections.map(([key]) => key)).toEqual([
      "feed-moderation",
      "questions",
      "users",
      "mail",
      "media",
      "admin",
      "partners",
      "profit",
      "feature-flags",
      "broadcasts",
      "reengagement",
      "rewarded-ads",
      "gafus",
      "mobile-intro",
      "app-subscriptions",
      "consultations",
      "bookings",
      "trainers-schedules",
    ]);
  });
  it.each(sections)("%s renders a real section for an empty server DTO", (_key, view, text) => {
    const html = renderToStaticMarkup(view);
    expect(html).toContain(text);
    expect(html).not.toContain("[object Object]");
  });
});
