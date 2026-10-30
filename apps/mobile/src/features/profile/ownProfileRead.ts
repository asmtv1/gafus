/** Private current-user GET scope for the existing mounted Profile tab.
 * Legacy shared ["user-profile"] is deliberately not used for verified rendering.
 * This module does not initialize providers, storage or native SDKs.
 */
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { userApi } from "@/shared/lib/api/user";
import { reportClientError } from "@/shared/lib/tracer";
import type { User } from "@/shared/lib/api/auth";

export type OwnProfileActor = { ownerId: string; authEpoch: string };
export type VerifiedOwnProfile = {
  success: true;
  data: User;
  __ownerId: string;
  __authEpoch: string;
};

export function verifiedOwnProfileActor(): OwnProfileActor | null {
  const state = useAuthStore.getState();
  if (!state.isAuthenticated || state.isLoading || !state.user?.id) return null;
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (!binding || binding.principalId !== state.user.id || !binding.authEpoch) return null;
  return { ownerId: state.user.id, authEpoch: binding.authEpoch };
}

export function isCurrentOwnProfileActor(actor: OwnProfileActor | null): boolean {
  if (!actor) return false;
  const now = verifiedOwnProfileActor();
  return now?.ownerId === actor.ownerId && now.authEpoch === actor.authEpoch;
}

const roles = new Set<User["role"]>(["USER", "PARTNER", "TRAINER", "ADMIN", "MODERATOR"]);
const profileFields = [
  "fullName",
  "city",
  "about",
  "telegram",
  "instagram",
  "website",
  "birthDate",
  "avatarUrl",
] as const;
const optionalText = (value: unknown): value is string | null | undefined =>
  value == null || typeof value === "string";

/** Runtime-owned DTO whitelist; no untrusted server/private cache extras. */
export function validatedOwnProfile(value: unknown, actor: OwnProfileActor): User {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("OWN_PROFILE_INVALID");
  const row = value as Record<string, unknown>;
  if (
    row.id !== actor.ownerId ||
    typeof row.username !== "string" ||
    !row.username.trim() ||
    !roles.has(row.role as User["role"]) ||
    !optionalText(row.email) ||
    !optionalText(row.phone) ||
    (row.hasAppPassword !== undefined && typeof row.hasAppPassword !== "boolean") ||
    (row.hasVkLinked !== undefined && typeof row.hasVkLinked !== "boolean")
  )
    throw new Error("OWN_PROFILE_INVALID");
  let profile: User["profile"] = undefined;
  if (row.profile !== undefined && row.profile !== null) {
    if (typeof row.profile !== "object" || Array.isArray(row.profile))
      throw new Error("OWN_PROFILE_INVALID");
    const source = row.profile as Record<string, unknown>;
    for (const key of profileFields)
      if (!optionalText(source[key])) throw new Error("OWN_PROFILE_INVALID");
    profile = {
      fullName: (source.fullName as string | null | undefined) ?? null,
      city: (source.city as string | null | undefined) ?? null,
      about: (source.about as string | null | undefined) ?? null,
      telegram: (source.telegram as string | null | undefined) ?? null,
      instagram: (source.instagram as string | null | undefined) ?? null,
      website: (source.website as string | null | undefined) ?? null,
      birthDate: (source.birthDate as string | null | undefined) ?? null,
      avatarUrl: (source.avatarUrl as string | null | undefined) ?? null,
    };
  }
  return {
    id: actor.ownerId,
    username: row.username,
    role: row.role as User["role"],
    email: (row.email as string | null | undefined) ?? null,
    phone: (row.phone as string | null | undefined) ?? null,
    ...(row.hasAppPassword !== undefined ? { hasAppPassword: row.hasAppPassword as boolean } : {}),
    ...(row.hasVkLinked !== undefined ? { hasVkLinked: row.hasVkLinked as boolean } : {}),
    ...(profile !== undefined ? { profile } : {}),
  };
}

/** Rejects even forged same-key results without a verified exact-scope stamp. */
export function ownProfileForActor(value: unknown, actor: OwnProfileActor | null): User | null {
  if (!isCurrentOwnProfileActor(actor) || !value || typeof value !== "object") return null;
  const read = value as Partial<VerifiedOwnProfile>;
  if (
    read.success !== true ||
    read.__ownerId !== actor!.ownerId ||
    read.__authEpoch !== actor!.authEpoch
  )
    return null;
  try {
    return validatedOwnProfile(read.data, actor!);
  } catch {
    reportClientError(new Error("OWN_PROFILE_CACHE_INVALID"), {
      issueKey: "OwnProfileRead",
      keys: { operation: "cache_projection" },
    });
    return null;
  }
}

export function ownProfileQueryOptions(actor: OwnProfileActor | null) {
  return {
    // Do not collide with the edit form's unwrapped User DTO under the same owner/epoch.
    queryKey: [
      "user-profile",
      "own-tab",
      actor?.ownerId ?? null,
      actor?.authEpoch ?? null,
    ] as const,
    enabled: isCurrentOwnProfileActor(actor),
    retry: false as const,
    staleTime: 0,
    queryFn: async (): Promise<VerifiedOwnProfile> => {
      if (!isCurrentOwnProfileActor(actor)) throw new Error("OWN_PROFILE_SESSION_CHANGED");
      const res = await userApi.getProfile(() => isCurrentOwnProfileActor(actor));
      if (!isCurrentOwnProfileActor(actor)) throw new Error("OWN_PROFILE_SESSION_CHANGED");
      if (!res.success) throw new Error("OWN_PROFILE_UNAVAILABLE");
      return {
        success: true,
        data: validatedOwnProfile(res.data, actor!),
        __ownerId: actor!.ownerId,
        __authEpoch: actor!.authEpoch,
      };
    },
  };
}
