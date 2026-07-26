import { prisma } from "@gafus/prisma";

import {
  APP_FEATURE_MOBILE_REWARDED_ADS_IOS,
  getMobileFeatureFlagEnabled,
  type ClientAppContext,
} from "../appFeatureFlags";
import { REWARDED_DAILY_LIMIT_VALUES } from "./constants";
import type {
  RewardedAdSettingsDto,
  RewardedDailyLimit,
  RewardedPlatform,
  RewardedPlatformSettingsDto,
} from "./types";

const SETTINGS_KEY = "default";
const MAX_PLACEMENT_ID_LENGTH = 256;

type SettingsUpdateInput = Partial<RewardedAdSettingsDto>;
type SettingsRowInput = Omit<Partial<RewardedAdSettingsDto>, "dailyAdLimit"> & {
  dailyAdLimit?: number;
};

const DEFAULT_SETTINGS: RewardedAdSettingsDto = {
  androidEnabled: false,
  iosEnabled: false,
  dailyAdLimit: 1,
  yandexAndroidPlacementId: null,
  yandexIosPlacementId: null,
  testMode: true,
};

function normalizePlacementId(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : (value ?? null);
  if (!normalized) {
    return null;
  }
  if (normalized.length > MAX_PLACEMENT_ID_LENGTH) {
    throw new Error("placement id is too long");
  }
  return normalized;
}

function normalizeDailyLimit(value: number | undefined): RewardedDailyLimit | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!REWARDED_DAILY_LIMIT_VALUES.includes(value as RewardedDailyLimit)) {
    throw new Error("dailyAdLimit must be 1, 2 or 3");
  }
  return value as RewardedDailyLimit;
}

function mapSettingsRow(row: SettingsRowInput | null | undefined): RewardedAdSettingsDto {
  return {
    ...DEFAULT_SETTINGS,
    ...row,
    dailyAdLimit: normalizeDailyLimit(row?.dailyAdLimit) ?? DEFAULT_SETTINGS.dailyAdLimit,
    yandexAndroidPlacementId: normalizePlacementId(row?.yandexAndroidPlacementId),
    yandexIosPlacementId: normalizePlacementId(row?.yandexIosPlacementId),
  };
}

function validateEnabledPlatforms(settings: RewardedAdSettingsDto): void {
  if (settings.testMode) {
    return;
  }
  const required: [boolean, string | null][] = [
    [settings.androidEnabled, settings.yandexAndroidPlacementId],
    [settings.iosEnabled, settings.yandexIosPlacementId],
  ];
  if (required.some(([enabled, placementId]) => enabled && !placementId)) {
    throw new Error("placement id is required before enabling production rewarded ads");
  }
}

export async function getRewardedAdSettings(): Promise<RewardedAdSettingsDto> {
  const row = await prisma.rewardedAdSettings.findUnique({
    where: { key: SETTINGS_KEY },
  });
  return mapSettingsRow(row);
}

export async function updateRewardedAdSettings(
  input: SettingsUpdateInput,
  actorId?: string | null,
): Promise<RewardedAdSettingsDto> {
  const current = await getRewardedAdSettings();
  const next = mapSettingsRow({
    ...current,
    ...input,
    dailyAdLimit: normalizeDailyLimit(input.dailyAdLimit) ?? current.dailyAdLimit,
    yandexAndroidPlacementId:
      input.yandexAndroidPlacementId === undefined
        ? current.yandexAndroidPlacementId
        : normalizePlacementId(input.yandexAndroidPlacementId),
    yandexIosPlacementId:
      input.yandexIosPlacementId === undefined
        ? current.yandexIosPlacementId
        : normalizePlacementId(input.yandexIosPlacementId),
  });

  validateEnabledPlatforms(next);

  const data = {
    ...next,
    updatedById: actorId ?? null,
  };
  const saved = await prisma.rewardedAdSettings.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, ...data },
    update: data,
  });

  return mapSettingsRow(saved);
}

export async function resolveRewardedPlatformSettings(
  platform: RewardedPlatform,
  clientContext?: ClientAppContext,
): Promise<RewardedPlatformSettingsDto> {
  const settings = await getRewardedAdSettings();
  const iosEnabled =
    platform === "IOS" && clientContext
      ? await getMobileFeatureFlagEnabled(
          APP_FEATURE_MOBILE_REWARDED_ADS_IOS,
          clientContext,
          settings.iosEnabled,
          false,
        )
      : settings.iosEnabled;
  const byPlatform: Record<RewardedPlatform, { enabled: boolean; placementId: string | null }> = {
    ANDROID: {
      enabled: settings.androidEnabled,
      placementId:
        settings.yandexAndroidPlacementId ?? (settings.testMode ? "demo-rewarded-yandex" : null),
    },
    IOS: {
      enabled: iosEnabled,
      placementId:
        settings.yandexIosPlacementId ?? (settings.testMode ? "demo-rewarded-yandex" : null),
    },
  };
  const selected = byPlatform[platform];

  return {
    platform,
    platformEnabled: selected.enabled,
    placementId: selected.placementId ?? "",
    dailyAdLimit: settings.dailyAdLimit,
    testMode: settings.testMode,
  };
}

export async function getPlacementIdForPlatform(platform: RewardedPlatform): Promise<string> {
  return (await resolveRewardedPlatformSettings(platform)).placementId;
}
