/** Database-independent value contracts: all SQL implementation types are owned by Persistence.
 * Prisma delegate promises are represented as ordinary promises; database
 * transactions are opaque and must be passed unchanged to the server adapter. */
export type UserRole = "USER" | "PARTNER" | "TRAINER" | "ADMIN" | "MODERATOR";
/** Exact typed SQL adapter boundary for auth.
 * Functions keep original argument/result signatures (including transaction
 * callbacks). Registration occurs only in an owning composition root.
 * Port rejects missing/multiple bindings; no fallback or fake successes. */
export const RegistrationChannel = { WEB: "WEB", IOS: "IOS", ANDROID: "ANDROID", UNKNOWN: "UNKNOWN" } as const;
export type RegistrationChannel = (typeof RegistrationChannel)[keyof typeof RegistrationChannel];
export type AuthRefreshMetadata = {
    deviceId?: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
};
export type RefreshRotationOutcome = "ROTATED" | "REGISTRATION_PENDING" | "CONFLICT";
export interface AuthRowsPort {
    readAuthUsernameChangeActor: (userId: string) => Promise<{
        id: string;
        username: string;
        email: string | null;
    } | null>;
    readAuthUsernameCandidate: (username: string) => Promise<{
        feedPublishingBlocked: boolean;
        feedPublishingBlockReason: string | null;
        id: string;
        username: string;
        email: string | null;
        phone: string | null;
        appleAppAccountToken: string | null;
        password: string;
        passwordSetAt: Date | null;
        sessionsRevokedAt: Date | null;
        onboardingTourCompletedAt: Date | null;
        telegramId: string | null;
        role: UserRole;
        registrationChannel: RegistrationChannel;
        passwordResetRequestedAt: Date | null;
        accountDeletionRequestedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        savedRegistrationPromoCodeId: string | null;
        registrationPending: boolean;
    } | null>;
    updateAuthUsername: (userId: string, username: string) => Promise<{
        feedPublishingBlocked: boolean;
        feedPublishingBlockReason: string | null;
        id: string;
        username: string;
        email: string | null;
        phone: string | null;
        appleAppAccountToken: string | null;
        password: string;
        passwordSetAt: Date | null;
        sessionsRevokedAt: Date | null;
        onboardingTourCompletedAt: Date | null;
        telegramId: string | null;
        role: UserRole;
        registrationChannel: RegistrationChannel;
        passwordResetRequestedAt: Date | null;
        accountDeletionRequestedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        savedRegistrationPromoCodeId: string | null;
        registrationPending: boolean;
    }>;
    readAuthCurrentUsername: (userId: string) => Promise<{
        username: string;
    } | null>;
    readAuthUsernameOwner: (username: string) => Promise<{
        id: string;
    } | null>;
    readAuthUserSummary: (userId: string) => Promise<{
        id: string;
        username: string;
        phone: string | null;
        role: UserRole;
    } | null>;
    readLoginCredentials: (username: string) => Promise<{
        id: string;
        username: string;
        password: string;
        role: UserRole;
        registrationPending: boolean;
    } | null>;
    readAuthRegistrationPending: (userId: string) => Promise<{
        registrationPending: boolean;
    } | null>;
    createAuthRefreshToken: (userId: string, id: string, tokenHash: string, metadata: AuthRefreshMetadata) => Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        expiresAt: Date;
        revokedAt: Date | null;
        tokenHash: string;
        deviceId: string | null;
        userAgent: string | null;
        ipAddress: string | null;
    }>;
    readAuthRefreshToken: (tokenHash: string) => Promise<({
        user: {
            id: string;
            username: string;
            role: UserRole;
            registrationPending: boolean;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        expiresAt: Date;
        revokedAt: Date | null;
        tokenHash: string;
        deviceId: string | null;
        userAgent: string | null;
        ipAddress: string | null;
    }) | null>;
    rotateAuthRefreshToken: (oldTokenHash: string, userId: string, newTokenHash: string, newTokenId: string, metadata: AuthRefreshMetadata) => Promise<RefreshRotationOutcome>;
    revokeAuthRefreshToken: (tokenHash: string) => Promise<void>;
    revokeAllAuthSessions: (userId: string) => Promise<void>;
    readAuthVkPhone: (userId: string) => Promise<{
        phone: string | null;
    } | null>;
    readAuthPhoneOwnerExcluding: (userId: string, phone: string) => Promise<{
        feedPublishingBlocked: boolean;
        feedPublishingBlockReason: string | null;
        id: string;
        username: string;
        email: string | null;
        phone: string | null;
        appleAppAccountToken: string | null;
        password: string;
        passwordSetAt: Date | null;
        sessionsRevokedAt: Date | null;
        onboardingTourCompletedAt: Date | null;
        telegramId: string | null;
        role: UserRole;
        registrationChannel: RegistrationChannel;
        passwordResetRequestedAt: Date | null;
        accountDeletionRequestedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        savedRegistrationPromoCodeId: string | null;
        registrationPending: boolean;
    } | null>;
    updateAuthVkPhone: (userId: string, phone: string) => Promise<{
        feedPublishingBlocked: boolean;
        feedPublishingBlockReason: string | null;
        id: string;
        username: string;
        email: string | null;
        phone: string | null;
        appleAppAccountToken: string | null;
        password: string;
        passwordSetAt: Date | null;
        sessionsRevokedAt: Date | null;
        onboardingTourCompletedAt: Date | null;
        telegramId: string | null;
        role: UserRole;
        registrationChannel: RegistrationChannel;
        passwordResetRequestedAt: Date | null;
        accountDeletionRequestedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        savedRegistrationPromoCodeId: string | null;
        registrationPending: boolean;
    }>;
    readAuthPasswordSetAt: (userId: string) => Promise<{
        passwordSetAt: Date | null;
    } | null>;
    setAuthPasswordOnce: (userId: string, hash: string) => Promise<boolean>;
    readAuthNotificationEmail: (userId: string) => Promise<{
        email: string | null;
    } | null>;
    readAuthPasswordForChange: (userId: string) => Promise<{
        password: string;
        passwordSetAt: Date | null;
    } | null>;
    changeAuthPasswordCAS: (userId: string, oldHash: string, newHash: string) => Promise<boolean>;
}
