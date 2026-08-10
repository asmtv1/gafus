export type RewardedAdsDashboardPeriodDays = 7 | 30 | 90;

export interface RewardedAdsSummary {
  sessions: number;
  uniqueUsers: number;
  loaded: number;
  shown: number;
  rewarded: number;
  granted: number;
  skipped: number;
  failed: number;
  uniqueShownUsers: number;
  uniqueRewardedUsers: number;
  uniqueSkippedUsers: number;
  loadRate: number;
  showRate: number;
  completionRate: number;
  grantRate: number;
  skipRate: number;
  errorRate: number;
}

export interface RewardedAdsTodayActivity {
  sessionsStarted: number;
  uniqueUsersStarted: number;
  loaded: number;
  shown: number;
  rewarded: number;
  granted: number;
  skipped: number;
  failed: number;
  uniqueShownUsers: number;
  uniqueRewardedUsers: number;
  uniqueSkippedUsers: number;
}

export interface RewardedAdsPlatformBreakdown extends RewardedAdsSummary {
  platform: "ANDROID" | "IOS";
}

export interface RewardedAdsTargetBreakdown extends RewardedAdsSummary {
  targetType: string;
  targetId: string;
  title: string;
  context: string | null;
}

export interface RewardedAdsDailyPoint {
  date: string;
  sessions: number;
  shown: number;
  rewarded: number;
  skipped: number;
  failed: number;
  completionRate: number;
}

export interface RewardedAdsFailureBreakdown {
  code: string;
  count: number;
}

export interface RewardedAdsAdminDashboard {
  generatedAt: string;
  timeZone: "Europe/Moscow";
  range: {
    days: RewardedAdsDashboardPeriodDays;
    start: string;
    end: string;
  };
  settings: {
    androidEnabled: boolean;
    iosEnabled: boolean;
    testMode: boolean;
  };
  today: RewardedAdsTodayActivity;
  period: RewardedAdsSummary;
  byPlatform: RewardedAdsPlatformBreakdown[];
  byTarget: RewardedAdsTargetBreakdown[];
  daily: RewardedAdsDailyPoint[];
  failures: RewardedAdsFailureBreakdown[];
}
