/**
 * Shared runtime identity for versioned mobile release update errors.
 * Both Core compatibility exports and the feature-flags Persistence adapter
 * must use exactly these constructors so `instanceof` catches remain stable.
 * No SQL, API, platform or feature-flag reader is imported here.
 */
export class RetiredRewardedAdsReadOnlyError extends Error {
  readonly code = "RETIRED_REWARDED_ADS_READ_ONLY";
  constructor() {
    super("Архив вознаграждаемой рекламы закрыт для изменений");
    this.name = "RetiredRewardedAdsReadOnlyError";
  }
}

export class MobileReleaseControlConflictError extends Error {
  readonly code = "STALE_CONFIG";
  constructor() {
    super("Настройки уже изменены в другой вкладке. Обновите страницу.");
    this.name = "MobileReleaseControlConflictError";
  }
}
