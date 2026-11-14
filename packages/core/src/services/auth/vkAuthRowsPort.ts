/** Database-independent value contracts: all SQL implementation types are owned by Persistence.
 * Prisma delegate promises are represented as ordinary promises; database
 * transactions are opaque and must be passed unchanged to the server adapter. */
export type UserRole = "USER" | "PARTNER" | "TRAINER" | "ADMIN" | "MODERATOR";
/** Exact typed SQL adapter boundary for vk.
 * Functions keep original argument/result signatures (including transaction
 * callbacks). Registration occurs only in an owning composition root.
 * Port rejects missing/multiple bindings; no fallback or fake successes. */
import type { RegistrationChannel } from "./authRowsPort";
export type SanitizedVkFields = {
    fullName: string | null;
    birthDate: Date | null;
    avatarUrl: string | null;
};
export interface VkAuthRowsPort {
    readVkUserEmail: (userId: string) => Promise<{
        email: string | null;
    } | null>;
    readVkEmailOwner: (email: string) => Promise<{
        id: string;
    } | null>;
    updateVkUserEmail: (userId: string, email: string) => Promise<{
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
    readDetailedVkAccount: (providerAccountId: string) => Promise<({
        user: {
            id: string;
            username: string;
            phone: string | null;
            role: UserRole;
            registrationPending: boolean;
            profile: {
                fullName: string | null;
                birthDate: Date | null;
                avatarUrl: string | null;
            } | null;
        };
    } & {
        id: string;
        userId: string;
        type: string;
        provider: string;
        providerAccountId: string;
        refresh_token: string | null;
        access_token: string | null;
        expires_at: number | null;
        token_type: string | null;
        scope: string | null;
        id_token: string | null;
        session_state: string | null;
    }) | null>;
    readVkUsernameCollision: (username: string) => Promise<{
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
    upsertLinkedVkProfile: (userId: string, fields: SanitizedVkFields, updateData: Record<string, unknown>) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        fullName: string | null;
        city: string | null;
        cityKey: string | null;
        birthDate: Date | null;
        about: string | null;
        telegram: string | null;
        instagram: string | null;
        website: string | null;
        avatarUrl: string | null;
    }>;
    createPendingVkAccount: (username: string, phone: string, password: string, registrationChannel: RegistrationChannel, emailForCreate: string | undefined, providerAccountId: string, fields: SanitizedVkFields) => Promise<{
        user: {
            id: string;
            username: string;
            phone: string | null;
            role: UserRole;
            registrationPending: boolean;
        };
        created: boolean;
    }>;
    readVkLinkedAccountOwner: (providerAccountId: string) => Promise<{
        userId: string;
    } | null>;
    linkVkAccountAndMergeProfile: (userId: string, providerAccountId: string, fields: SanitizedVkFields) => Promise<void>;
}
let installed: Readonly<VkAuthRowsPort> | null = null;
export function registerVkAuthRowsPort(port: VkAuthRowsPort): void {
    if (installed && installed !== port)
        throw new Error("VK_AUTH_ROWS_PORT_ALREADY_BOUND");
    installed = port;
}
function requireRows(): Readonly<VkAuthRowsPort> {
    if (!installed)
        throw new Error("VK_AUTH_ROWS_PORT_UNBOUND");
    return installed;
}
export const readVkUserEmail: VkAuthRowsPort["readVkUserEmail"] = (...args) => requireRows().readVkUserEmail(...args);
export const readVkEmailOwner: VkAuthRowsPort["readVkEmailOwner"] = (...args) => requireRows().readVkEmailOwner(...args);
export const updateVkUserEmail: VkAuthRowsPort["updateVkUserEmail"] = (...args) => requireRows().updateVkUserEmail(...args);
export const readDetailedVkAccount: VkAuthRowsPort["readDetailedVkAccount"] = (...args) => requireRows().readDetailedVkAccount(...args);
export const readVkUsernameCollision: VkAuthRowsPort["readVkUsernameCollision"] = (...args) => requireRows().readVkUsernameCollision(...args);
export const upsertLinkedVkProfile: VkAuthRowsPort["upsertLinkedVkProfile"] = (...args) => requireRows().upsertLinkedVkProfile(...args);
export const createPendingVkAccount: VkAuthRowsPort["createPendingVkAccount"] = (...args) => requireRows().createPendingVkAccount(...args);
export const readVkLinkedAccountOwner: VkAuthRowsPort["readVkLinkedAccountOwner"] = (...args) => requireRows().readVkLinkedAccountOwner(...args);
export const linkVkAccountAndMergeProfile: VkAuthRowsPort["linkVkAccountAndMergeProfile"] = (...args) => requireRows().linkVkAccountAndMergeProfile(...args);
export type { RegistrationChannel } from "./authRowsPort";
