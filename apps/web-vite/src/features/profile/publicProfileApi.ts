import { apiRequest, isolatedNonprodBrowserS3Url } from "../../shared/api/client";

/** AG1 GET /user/profile/public whitelist: only fields shown in legacy visitor Bio. */
export type PublicProfileSummary = {
  username: string;
  role: "USER" | "PARTNER" | "ADMIN" | "MODERATOR" | "TRAINER";
  fullName: string | null;
  city: string | null;
  about: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
  telegram: string | null;
  instagram: string | null;
  website: string | null;
  pets: { id: string; name: string; type: string; breed: string;
    birthDate: string | null; photoUrl: string | null }[];
  diplomas: { id: string; title: string; issuedBy: string | null;
    issuedAt: string; url: string | null }[];
  courses: { id: string; name: string; type: string; shortDesc: string;
    duration: string; isPaid: boolean; isPrivate: boolean;
    trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
    avgRating: number | null; logoImg: string | null }[] | null;
};

const roles = new Set(["USER", "PARTNER", "ADMIN", "MODERATOR", "TRAINER"]);
const levels = new Set(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]);
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const nullableText = (v: unknown): v is string | null =>
  v === null || typeof v === "string";
const text = (v: unknown): v is string => typeof v === "string";
const dateOrNull = (v: unknown): v is string | null =>
  v === null || (text(v) && Number.isFinite(Date.parse(v)));
const uniqueIds = (items: { id: string }[]) =>
  new Set(items.map(x => x.id)).size === items.length;

/** No external URL/HTML field from a public DTO becomes a link without a safe scheme. */
export function publicExternalUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!(["https:", "http:"].includes(url.protocol)) ||
        !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
export function publicImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  // The isolated Documents bucket is private: only exact dev avatar signed GET.
  // Never grant general HTTP media access in production or for other objects.
  if (isolatedNonprodBrowserS3Url(raw, "documents", "signed-get")) {
    const url = new URL(raw);
    const owned = url.pathname.startsWith(
      "/gafus-refactor-documents-test/documents/uploads/users/",
    );
    if (owned && /\/avatar\/[a-f0-9-]{36}\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname))
      return url.href;
  }
  // Do not fall through to the permissive historical external-image check
  // for a failed private localhost signature/bucket/path validation.
  try {
    const url = new URL(raw);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost" ||
        url.hostname === "[::1]") return null;
  } catch { /* Relative legacy image paths follow below. */ }
  if (raw.startsWith("/") && !raw.startsWith("//") &&
      ![...raw].some(char => {
        const code = char.charCodeAt(0);
        return code <= 31 || code === 127 || code === 92;
      })) return raw;
  return publicExternalUrl(raw);
}

export async function getPublicProfileSummary(username: string): Promise<PublicProfileSummary> {
  if (!username || username.length > 256 || [...username].some(char => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  })) throw new Error("Некорректное имя пользователя");
  const raw = await apiRequest<unknown>(
    "/api/v1/user/profile/public?username=" + encodeURIComponent(username),
  );
  if (!object(raw) || raw.username !== username || !roles.has(String(raw.role)) ||
      !(raw.profile === null || object(raw.profile)) ||
      !Array.isArray(raw.pets) || !Array.isArray(raw.diplomas)) {
    throw new Error("Сервер вернул некорректный публичный профиль");
  }
  const profile = raw.profile;
  if (profile && (!nullableText(profile.fullName) || !nullableText(profile.about) ||
      !(profile.city === undefined || nullableText(profile.city)) ||
      !dateOrNull(profile.birthDate) || !nullableText(profile.avatarUrl) ||
      !nullableText(profile.telegram) || !nullableText(profile.instagram) ||
      !nullableText(profile.website))) {
    throw new Error("Сервер вернул некорректные публичные сведения");
  }
  const pets = raw.pets;
  if (!pets.every((pet: unknown) => object(pet) &&
      text(pet.id) && pet.id.length > 0 && text(pet.name) &&
      text(pet.type) && text(pet.breed) &&
      dateOrNull(pet.birthDate) && nullableText(pet.photoUrl)) ||
      !uniqueIds(pets)) {
    throw new Error("Сервер вернул некорректный список питомцев");
  }
  const diplomas = raw.diplomas;
  if (!diplomas.every((d: unknown) => object(d) &&
      text(d.id) && d.id.length > 0 && text(d.title) &&
      nullableText(d.issuedBy) && dateOrNull(d.issuedAt) && d.issuedAt !== null &&
      (d.url === undefined || nullableText(d.url))) ||
      !uniqueIds(diplomas)) {
    throw new Error("Сервер вернул некорректный список дипломов");
  }
  let courses: PublicProfileSummary["courses"] = null;
  if (raw.courses !== undefined) {
    // Core returns authored courses only to TRAINER, filtered by showInProfile.
    if (raw.role !== "TRAINER" || !Array.isArray(raw.courses) ||
        !raw.courses.every((c: unknown) => object(c) &&
          text(c.id) && /^[A-Za-z0-9_-]{1,128}$/.test(c.id) &&
          text(c.name) && text(c.type) &&
          text(c.shortDesc) && text(c.duration) && text(c.logoImg) &&
          typeof c.isPrivate === "boolean" && typeof c.isPaid === "boolean" &&
          (c.avgRating === null || (typeof c.avgRating === "number" &&
            Number.isFinite(c.avgRating))) && levels.has(String(c.trainingLevel)) &&
          text(c.updatedAt) && Number.isFinite(Date.parse(c.updatedAt))) ||
        !uniqueIds(raw.courses)) {
      throw new Error("Сервер вернул некорректные публичные курсы кинолога");
    }
    courses = raw.courses.map((c: Record<string, unknown>) => ({
      id: c.id as string, name: c.name as string, type: c.type as string,
      shortDesc: c.shortDesc as string, duration: c.duration as string,
      isPaid: c.isPaid as boolean, isPrivate: c.isPrivate as boolean,
      trainingLevel: c.trainingLevel as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
      avgRating: c.avgRating as number | null, logoImg: (c.logoImg as string) || null,
    }));
  }
  return {
    username: raw.username as string, role: raw.role as PublicProfileSummary["role"],
    fullName: profile ? profile.fullName as string | null : null,
    city: profile ? (profile.city ?? null) as string | null : null,
    about: profile ? profile.about as string | null : null,
    birthDate: profile ? profile.birthDate as string | null : null,
    avatarUrl: profile ? profile.avatarUrl as string | null : null,
    telegram: profile ? profile.telegram as string | null : null,
    instagram: profile ? profile.instagram as string | null : null,
    website: profile ? profile.website as string | null : null,
    pets: pets.map((pet: Record<string, unknown>) => ({
      id: pet.id as string, name: pet.name as string, type: pet.type as string,
      breed: pet.breed as string, birthDate: pet.birthDate as string | null,
      photoUrl: pet.photoUrl as string | null,
    })),
    diplomas: diplomas.map((d: Record<string, unknown>) => ({
      id: d.id as string, title: d.title as string,
      issuedBy: d.issuedBy as string | null, issuedAt: d.issuedAt as string,
      url: (d.url ?? null) as string | null,
    })),
    courses,
  };
}
