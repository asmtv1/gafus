/** Database-independent value contracts: all SQL implementation types are owned by Persistence.
 * Prisma delegate promises are represented as ordinary promises; database
 * transactions are opaque and must be passed unchanged to the server adapter. */
export type PortableJsonValue = null | string | number | boolean | { readonly [key: string]: PortableJsonValue } | readonly PortableJsonValue[];
export type RewardedTargetAccessType = "ARTICLE" | "COURSE_STEP";
export type RewardedTargetAccessSource = "REWARDED_AD" | "LEGACY_GAFUS";
export type RewardedPlatform = "ANDROID" | "IOS";
export type RewardedTargetType = "ARTICLE" | "COURSE_STEP" | "DAILY_COURSE_STEP" | "CONSULTATION_BOOKING";
export type RewardedProvider = "YANDEX";
export type RewardedAdSessionStatus = "CREATED" | "LOADED" | "SHOWN" | "REWARDED" | "GRANTED" | "DISMISSED" | "FAILED" | "EXPIRED";
export type AdSessionTx = unknown;
type AccessTarget = {
    targetType: "ARTICLE" | "COURSE_STEP";
    targetId: string;
};
type Platform = "IOS" | "ANDROID";
export interface RewardedAdRowsPort {
    countRewardedDayRows: (userId: string, start: Date, end: Date, tx?: AdSessionTx) => Promise<number>;
    existsPublicRewardedArticle: (targetId: string) => Promise<boolean>;
    existsPublicRewardedStep: (targetId: string) => Promise<boolean>;
    findActiveRewardedAccess: (userId: string, target: AccessTarget, now: Date, tx?: AdSessionTx) => Promise<{
        userId: string;
        id: string;
        targetType: RewardedTargetAccessType;
        targetId: string;
        source: RewardedTargetAccessSource;
        platform: RewardedPlatform | null;
        sessionId: string | null;
        grantedAt: Date;
        expiresAt: Date;
        createdAt: Date;
    } | null>;
    findBlockingAdSession: (userId: string, platform: Platform, target: AccessTarget, statuses: readonly RewardedAdSessionStatus[], now: Date) => Promise<{
        userId: string;
        id: string;
        targetType: RewardedTargetType | null;
        targetId: string | null;
        platform: RewardedPlatform;
        grantedAt: Date | null;
        expiresAt: Date;
        createdAt: Date;
        provider: RewardedProvider;
        placementId: string;
        status: RewardedAdSessionStatus;
        requestNonceHash: string;
        providerPayload: PortableJsonValue | null;
        errorCode: string | null;
        errorMessage: string | null;
        rewardedAt: Date | null;
        updatedAt: Date;
    } | null>;
    createAdSessionRow: (input: {
        userId: string;
        platform: Platform;
        placementId: string;
        requestNonceHash: string;
        expiresAt: Date;
        target: AccessTarget;
    }) => Promise<{
        userId: string;
        id: string;
        targetType: RewardedTargetType | null;
        targetId: string | null;
        platform: RewardedPlatform;
        grantedAt: Date | null;
        expiresAt: Date;
        createdAt: Date;
        provider: RewardedProvider;
        placementId: string;
        status: RewardedAdSessionStatus;
        requestNonceHash: string;
        providerPayload: PortableJsonValue | null;
        errorCode: string | null;
        errorMessage: string | null;
        rewardedAt: Date | null;
        updatedAt: Date;
    }>;
    findRewardedAdSessionRow: (sessionId: string, tx?: AdSessionTx) => Promise<{
        userId: string;
        id: string;
        targetType: RewardedTargetType | null;
        targetId: string | null;
        platform: RewardedPlatform;
        grantedAt: Date | null;
        expiresAt: Date;
        createdAt: Date;
        provider: RewardedProvider;
        placementId: string;
        status: RewardedAdSessionStatus;
        requestNonceHash: string;
        providerPayload: PortableJsonValue | null;
        errorCode: string | null;
        errorMessage: string | null;
        rewardedAt: Date | null;
        updatedAt: Date;
    } | null>;
    withRewardedDailyLock: <T>(userId: string, callback: (tx: AdSessionTx) => Promise<T>) => Promise<T>;
    readShownRewardedEvent: (tx: AdSessionTx, sessionId: string) => Promise<{
        id: string;
    } | null>;
    readDailyRewardedSettings: (tx: AdSessionTx) => Promise<{
        dailyAdLimit: number;
    } | null>;
    appendRewardedAdEvent: (input: {
        sessionId: string;
        eventType: string;
        payload?: unknown;
    }, tx?: AdSessionTx) => Promise<{
        id: string;
        sessionId: string;
        createdAt: Date;
        eventType: string;
        payload: PortableJsonValue | null;
    }>;
    markAdSessionRewarded: (tx: AdSessionTx, sessionId: string, now: Date) => Promise<{
        userId: string;
        id: string;
        targetType: RewardedTargetType | null;
        targetId: string | null;
        platform: RewardedPlatform;
        grantedAt: Date | null;
        expiresAt: Date;
        createdAt: Date;
        provider: RewardedProvider;
        placementId: string;
        status: RewardedAdSessionStatus;
        requestNonceHash: string;
        providerPayload: PortableJsonValue | null;
        errorCode: string | null;
        errorMessage: string | null;
        rewardedAt: Date | null;
        updatedAt: Date;
    }>;
    markAdSessionNonRewardedStatus: (sessionId: string, previousStatus: RewardedAdSessionStatus, status: RewardedAdSessionStatus, failed: boolean) => Promise<{
        count: number;
    }>;
    findRewardedGrantBySession: (sessionId: string, tx?: AdSessionTx) => Promise<{
        userId: string;
        id: string;
        targetType: RewardedTargetAccessType;
        targetId: string;
        source: RewardedTargetAccessSource;
        platform: RewardedPlatform | null;
        sessionId: string | null;
        grantedAt: Date;
        expiresAt: Date;
        createdAt: Date;
    } | null>;
    markAdSessionExpired: (sessionId: string) => Promise<{
        userId: string;
        id: string;
        targetType: RewardedTargetType | null;
        targetId: string | null;
        platform: RewardedPlatform;
        grantedAt: Date | null;
        expiresAt: Date;
        createdAt: Date;
        provider: RewardedProvider;
        placementId: string;
        status: RewardedAdSessionStatus;
        requestNonceHash: string;
        providerPayload: PortableJsonValue | null;
        errorCode: string | null;
        errorMessage: string | null;
        rewardedAt: Date | null;
        updatedAt: Date;
    }>;
    withRewardedAccessLock: <T>(userId: string, target: AccessTarget, callback: (tx: AdSessionTx) => Promise<T>) => Promise<T>;
    createRewardedAccessGrant: (tx: AdSessionTx, input: {
        userId: string;
        target: AccessTarget;
        platform: Platform;
        sessionId: string;
        now: Date;
        expiresAt: Date;
    }) => Promise<{
        userId: string;
        id: string;
        targetType: RewardedTargetAccessType;
        targetId: string;
        source: RewardedTargetAccessSource;
        platform: RewardedPlatform | null;
        sessionId: string | null;
        grantedAt: Date;
        expiresAt: Date;
        createdAt: Date;
    }>;
    markAdSessionGranted: (tx: AdSessionTx, input: {
        sessionId: string;
        providerPayload?: unknown;
        rewardedAt: Date;
        grantedAt: Date;
    }) => Promise<{
        userId: string;
        id: string;
        targetType: RewardedTargetType | null;
        targetId: string | null;
        platform: RewardedPlatform;
        grantedAt: Date | null;
        expiresAt: Date;
        createdAt: Date;
        provider: RewardedProvider;
        placementId: string;
        status: RewardedAdSessionStatus;
        requestNonceHash: string;
        providerPayload: PortableJsonValue | null;
        errorCode: string | null;
        errorMessage: string | null;
        rewardedAt: Date | null;
        updatedAt: Date;
    }>;
}
let installed: Readonly<RewardedAdRowsPort> | null = null;
export function registerRewardedAdRowsPort(port: RewardedAdRowsPort): void {
    if (installed && installed !== port)
        throw new Error("REWARDED_AD_ROWS_PORT_ALREADY_BOUND");
    installed = port;
}
function requireRows(): Readonly<RewardedAdRowsPort> {
    if (!installed)
        throw new Error("REWARDED_AD_ROWS_PORT_UNBOUND");
    return installed;
}
export const countRewardedDayRows: RewardedAdRowsPort["countRewardedDayRows"] = (...args) => requireRows().countRewardedDayRows(...args);
export const existsPublicRewardedArticle: RewardedAdRowsPort["existsPublicRewardedArticle"] = (...args) => requireRows().existsPublicRewardedArticle(...args);
export const existsPublicRewardedStep: RewardedAdRowsPort["existsPublicRewardedStep"] = (...args) => requireRows().existsPublicRewardedStep(...args);
export const findActiveRewardedAccess: RewardedAdRowsPort["findActiveRewardedAccess"] = (...args) => requireRows().findActiveRewardedAccess(...args);
export const findBlockingAdSession: RewardedAdRowsPort["findBlockingAdSession"] = (...args) => requireRows().findBlockingAdSession(...args);
export const createAdSessionRow: RewardedAdRowsPort["createAdSessionRow"] = (...args) => requireRows().createAdSessionRow(...args);
export const findRewardedAdSessionRow: RewardedAdRowsPort["findRewardedAdSessionRow"] = (...args) => requireRows().findRewardedAdSessionRow(...args);
export const withRewardedDailyLock: RewardedAdRowsPort["withRewardedDailyLock"] = (...args) => requireRows().withRewardedDailyLock(...args);
export const readShownRewardedEvent: RewardedAdRowsPort["readShownRewardedEvent"] = (...args) => requireRows().readShownRewardedEvent(...args);
export const readDailyRewardedSettings: RewardedAdRowsPort["readDailyRewardedSettings"] = (...args) => requireRows().readDailyRewardedSettings(...args);
export const appendRewardedAdEvent: RewardedAdRowsPort["appendRewardedAdEvent"] = (...args) => requireRows().appendRewardedAdEvent(...args);
export const markAdSessionRewarded: RewardedAdRowsPort["markAdSessionRewarded"] = (...args) => requireRows().markAdSessionRewarded(...args);
export const markAdSessionNonRewardedStatus: RewardedAdRowsPort["markAdSessionNonRewardedStatus"] = (...args) => requireRows().markAdSessionNonRewardedStatus(...args);
export const findRewardedGrantBySession: RewardedAdRowsPort["findRewardedGrantBySession"] = (...args) => requireRows().findRewardedGrantBySession(...args);
export const markAdSessionExpired: RewardedAdRowsPort["markAdSessionExpired"] = (...args) => requireRows().markAdSessionExpired(...args);
export const withRewardedAccessLock: RewardedAdRowsPort["withRewardedAccessLock"] = (...args) => requireRows().withRewardedAccessLock(...args);
export const createRewardedAccessGrant: RewardedAdRowsPort["createRewardedAccessGrant"] = (...args) => requireRows().createRewardedAccessGrant(...args);
export const markAdSessionGranted: RewardedAdRowsPort["markAdSessionGranted"] = (...args) => requireRows().markAdSessionGranted(...args);
