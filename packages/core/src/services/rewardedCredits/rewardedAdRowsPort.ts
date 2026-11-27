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
