/* eslint-disable @gafus/require-client-catch-tracer -- malformed public URLs are expected input and must not log private strings. */
import type { PublicProfile, PublicProfileCourse } from "@/shared/lib/api/user";

/** Keep only fields returned by the public Hono selector; never forward unknown PII to child views. */
const publicText = (value: unknown): string | null => (typeof value === "string" ? value : null);
const safeImageUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
};

export function publicContactLinks(profile: PublicProfile["profile"]): {
  telegram: { name: string; url: string } | null;
  instagram: { name: string; url: string } | null;
  website: { name: string; url: string } | null;
} {
  const rawTelegram = profile?.telegram;
  const telegram =
    typeof rawTelegram === "string" && /^[a-z0-9_]{5,32}$/i.test(rawTelegram)
      ? { name: rawTelegram, url: `https://t.me/${rawTelegram}` }
      : null;
  const rawInstagram = profile?.instagram;
  const instagram =
    typeof rawInstagram === "string" &&
    /^[a-z0-9._]{1,30}$/i.test(rawInstagram) &&
    !rawInstagram.endsWith(".")
      ? { name: rawInstagram, url: `https://instagram.com/${rawInstagram}` }
      : null;
  const websiteUrl = profile?.website;
  let website: { name: string; url: string } | null = null;
  if (typeof websiteUrl === "string") {
    try {
      const parsed = new URL(websiteUrl);
      if (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        parsed.hostname &&
        !parsed.username &&
        !parsed.password &&
        !Array.from(websiteUrl).some((char) => char.charCodeAt(0) < 32)
      ) {
        website = { name: websiteUrl, url: parsed.href };
      }
    } catch {
      /* Malformed external links are not rendered or opened. */
    }
  }
  return { telegram, instagram, website };
}

/** Runtime projection: a future/accidental API overpost cannot surface private user or pet keys. */
export function projectPublicProfile(input: PublicProfile): PublicProfile | null {
  if (
    !input ||
    typeof input.username !== "string" ||
    !input.username.trim() ||
    typeof input.role !== "string"
  )
    return null;
  const rawProfile = input.profile;
  const profile =
    rawProfile && typeof rawProfile === "object"
      ? {
          fullName: publicText(rawProfile.fullName),
          city: publicText(rawProfile.city),
          birthDate: publicText(rawProfile.birthDate),
          about: publicText(rawProfile.about),
          telegram: publicText(rawProfile.telegram),
          instagram: publicText(rawProfile.instagram),
          website: publicText(rawProfile.website),
          avatarUrl: safeImageUrl(rawProfile.avatarUrl),
        }
      : null;
  const pets = Array.isArray(input.pets)
    ? input.pets.flatMap((pet) => {
        if (
          !pet ||
          typeof pet.id !== "string" ||
          typeof pet.name !== "string" ||
          // Server projects only showInProfile=true; respect a stricter field if accidentally returned.
          (pet as { showInProfile?: boolean }).showInProfile === false
        )
          return [];
        return [
          {
            id: pet.id,
            name: pet.name,
            type: typeof pet.type === "string" ? pet.type : "DOG",
            breed: publicText(pet.breed) ?? "",
            birthDate: publicText(pet.birthDate),
            photoUrl: safeImageUrl(pet.photoUrl),
          },
        ];
      })
    : [];
  const courses: PublicProfileCourse[] = Array.isArray(input.courses)
    ? input.courses.flatMap((c) => {
        if (
          !c ||
          typeof c.id !== "string" ||
          typeof c.name !== "string" ||
          typeof c.type !== "string" ||
          (c as { showInProfile?: boolean }).showInProfile === false
        )
          return [];
        return [
          {
            id: c.id,
            name: c.name,
            type: c.type,
            logoImg: publicText(c.logoImg) ?? "",
            shortDesc: publicText(c.shortDesc) ?? "",
            duration: publicText(c.duration) ?? "",
            isPrivate: c.isPrivate === true,
            isPaid: c.isPaid === true,
            avgRating:
              typeof c.avgRating === "number" && Number.isFinite(c.avgRating) ? c.avgRating : null,
            updatedAt: c.updatedAt,
            trainingLevel: c.trainingLevel,
          },
        ];
      })
    : [];
  const diplomas = Array.isArray(input.diplomas)
    ? input.diplomas.flatMap((d) => {
        if (!d || typeof d.id !== "string" || typeof d.title !== "string") return [];
        return [
          {
            id: d.id,
            title: d.title,
            issuedBy: publicText(d.issuedBy),
            issuedAt: publicText(d.issuedAt) ?? "",
          },
        ];
      })
    : [];
  return {
    username: input.username,
    role: input.role,
    chatRole:
      input.chatRole === "admin" || input.chatRole === "trainer" || input.chatRole === "subscriber"
        ? input.chatRole
        : null,
    profile,
    pets,
    courses: input.role === "TRAINER" ? courses : [],
    diplomas,
  };
}
