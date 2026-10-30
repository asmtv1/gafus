import { apiRequest, ApiError, isolatedNonprodBrowserS3Url } from "../../shared/api/client";
import { publicImageUrl } from "./publicProfileApi";
import {
  normalizeTelegramInput, normalizeInstagramInput, normalizeWebsiteUrl,
} from "@gafus/core-client/utils/social";

/** Strict minimal projection of the Hono /user/profile DTO. */
export type ProfileOverview = {
  id: string;
  username: string;
  /** Owner-only Hono projection, never shared via the public profile. */
  email?: string | null;
  hasAppPassword?: boolean;
  hasVkLinked?: boolean;
  profile: {
    fullName: string | null;
    city: string | null;
    about: string | null;
    telegram?: string | null;
    instagram?: string | null;
    website?: string | null;
    birthDate?: string | null;
    avatarUrl?: string | null;
  };
};

function textOrNull(data: unknown): data is string | null {
  return data === null || typeof data === "string";
}

export async function getMyProfile(): Promise<ProfileOverview> {
  const raw = await apiRequest<unknown>("/api/v1/user/profile");
  if (typeof raw !== "object" || !raw) throw new Error("Некорректный профиль");
  const user = raw as Record<string, unknown>;
  if (typeof user.id !== "string" || typeof user.username !== "string") {
    throw new Error("Некорректный профиль");
  }
  if (typeof user.profile !== "object" || !user.profile) {
    throw new Error("Некорректный профиль");
  }
  const profile = user.profile as Record<string, unknown>;
  if (!textOrNull(profile.fullName) ||
    !textOrNull(profile.city) ||
    !textOrNull(profile.about) ||
    ["telegram", "instagram", "website", "birthDate"].some(key =>
      profile[key] !== undefined && !textOrNull(profile[key])) ||
    (typeof profile.birthDate === "string" &&
      !/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate))) {
    throw new Error("Некорректный профиль");
  }
  // Only the authenticated owner's avatar may be projected, never secrets.
  const avatarUrl = profile.avatarUrl;
  const safeAvatar = typeof avatarUrl === "string" && avatarUrl.length <= 2000 &&
    !Array.from(avatarUrl).some(char => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 || code === 92;
    }) && !avatarUrl.includes("..") &&
    ((isolatedNonprodBrowserS3Url(avatarUrl,"documents","signed-get") &&
       publicImageUrl(avatarUrl) === avatarUrl) ||
      (!avatarUrl.includes("%") && (avatarUrl.startsWith("/uploads/users/") || (() => {
      try {
        const url = new URL(avatarUrl);
        if (url.protocol !== "https:" || url.username || url.password ||
            url.port || url.search || url.hash) return false;
        return (url.hostname === "storage.yandexcloud.net" &&
          url.pathname.startsWith("/gafus-media/uploads/users/")) ||
          (url.hostname === "gafus-media.storage.yandexcloud.net" &&
            url.pathname.startsWith("/uploads/users/"));
      } catch { return false; }
    })())));
  // Existing Hono/Core /user/profile is authenticated SELF-only and already
  // transports this field. The retained Next Bio displays the owner's own
  // email; omitting it here incorrectly rendered a missing-email placeholder.
  // Keep a strict owner-only whitelist: never project phone, refresh tokens,
  // roles from the DB snapshot, or any unknown fields into React/Query cache.
  const ownerEmail = user.email === null
    ? null
    : typeof user.email === "string" && user.email.length <= 320 &&
      user.email === user.email.trim() &&
      /^[^\s<>@]+@[^\s<>@]+$/.test(user.email)
      ? user.email
      : undefined;
  return {
    id: user.id,
    username: user.username,
    ...(ownerEmail !== undefined ? { email: ownerEmail } : {}),
    ...(typeof user.hasAppPassword === "boolean"
      ? {hasAppPassword:user.hasAppPassword} : {}),
    ...(typeof user.hasVkLinked === "boolean"
      ? {hasVkLinked:user.hasVkLinked} : {}),
    profile: {
      fullName: profile.fullName,
      city: profile.city,
      about: profile.about,
      ...(textOrNull(profile.telegram) ? { telegram: profile.telegram } : {}),
      ...(textOrNull(profile.instagram) ? { instagram: profile.instagram } : {}),
      ...(textOrNull(profile.website) ? { website: profile.website } : {}),
      ...(textOrNull(profile.birthDate) ? { birthDate: profile.birthDate } : {}),
      ...(safeAvatar ? { avatarUrl: avatarUrl as string } : {}),
    },
  };
}

/** Only confirmed Hono optional fields. Do not clear unchanged/unknown fields. */
export type ProfileChanges = Partial<{
  fullName: string;
  city: string;
  about: string;
  telegram: string;
  instagram: string;
  website: string;
  birthDate: string;
}>;

export function changedProfileFields(
  original: ProfileOverview["profile"],
  draft: { fullName: string; city: string; about: string;
    telegram?: string; instagram?: string; website?: string; birthDate?: string },
): ProfileChanges {
  const changed: ProfileChanges = {};
  const name = draft.fullName.trim();
  const city = draft.city.trim();
  const about = draft.about.trim();
  if (name !== (original.fullName ?? "")) changed.fullName = name;
  if (city !== (original.city ?? "")) changed.city = city;
  if (about !== (original.about ?? "")) changed.about = about;
  if (draft.telegram !== undefined && draft.telegram.trim() !== (original.telegram ?? "")) {
    const value = normalizeTelegramInput(draft.telegram);
    if (value !== (original.telegram ?? "")) changed.telegram = value;
  }
  if (draft.instagram !== undefined && draft.instagram.trim() !== (original.instagram ?? "")) {
    const value = normalizeInstagramInput(draft.instagram);
    if (value !== (original.instagram ?? "")) changed.instagram = value;
  }
  if (draft.website !== undefined && draft.website.trim() !== (original.website ?? "")) {
    const value = normalizeWebsiteUrl(draft.website);
    if (value !== (original.website ?? "")) changed.website = value;
  }
  if (draft.birthDate !== undefined) {
    const value = draft.birthDate.trim();
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value ||
      value > new Date().toISOString().slice(0, 10))) {
      throw Error("Некорректная дата рождения");
    }
    if (value !== (original.birthDate ?? "")) changed.birthDate = value;
  }
  return changed;
}

export function readbackMatchesProfile(
  profile: ProfileOverview, actorId: string, changes: ProfileChanges,
): boolean {
  return profile.id === actorId &&
    Object.entries(changes).every(([key, value]) => {
      const current = profile.profile[key as keyof ProfileChanges];
      // Core clears nullable profile fields to null. Hono edit sends the
      // empty string intentionally; null is the confirmed persisted clear.
      return value === "" ? current === "" || current === null : current === value;
    });
}

export async function updateMyProfile(changes: ProfileChanges): Promise<void> {
  if (Object.keys(changes).length === 0) throw new Error("Нет изменений");
  // Hono authenticates and validates; success envelope + exact status 200
  // is necessary, but not sufficient to prove a durable write.
  await apiRequest<unknown>("/api/v1/user/profile", {
    method: "PUT",
    json: changes,
    browserAuth: true,
    expectedStatus: 200,
  });
}

/** The already registered Hono POST /user/avatar is an owner-only multipart mutation.
 * A 200 ACK is not enough to complete the UI: the caller independently reads
 * owner AND public projections before replacing a rendered avatar. */
export async function uploadMyAvatar(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type))
    throw new Error("Выберите JPEG, PNG, WebP или GIF.");
  if (file.size < 1 || file.size > 5 * 1024 * 1024)
    throw new Error("Размер аватара должен быть от 1 байта до 5 МБ.");
  const body = new FormData(); body.append("file", file);
  const response = await fetch("/api/v1/user/avatar", {
    method: "POST", body, credentials: "include", cache: "no-store",
    headers: { Accept: "application/json", "X-Gafus-Auth-Transport": "cookie" },
  });
  let envelope: { success?: boolean; data?: { avatarUrl?: unknown }; error?: string;
    code?: string };
  try { envelope = await response.json() as typeof envelope; }
  catch { throw new ApiError(response.status, "Некорректный ответ API", "INVALID_RESPONSE"); }
  if (!response.ok || envelope?.success !== true)
    throw new ApiError(response.status, envelope?.error ?? "Не удалось загрузить аватар", envelope?.code);
  if (response.status !== 200 || !envelope.data ||
      typeof envelope.data.avatarUrl !== "string" ||
      publicImageUrl(envelope.data.avatarUrl) !== envelope.data.avatarUrl)
    throw new ApiError(response.status, "Ответ не подтверждает аватар", "INVALID_RESPONSE");
  return envelope.data.avatarUrl;
}
