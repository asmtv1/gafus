import type { UpdateProfileData } from "@/shared/lib/api/user";

const profileKeys = [
  "fullName",
  "city",
  "about",
  "telegram",
  "instagram",
  "website",
  "birthDate",
] as const;

type ProfileReadFields = Partial<Record<(typeof profileKeys)[number], string | null>>;

function comparable(field: (typeof profileKeys)[number], value: string | null | undefined): string {
  if (!value) return "";
  // The server returns UTC Date ISO while the form uses YYYY-MM-DD.
  if (field === "birthDate") return value.slice(0, 10);
  return value;
}

export function changedProfileFields(
  original: ProfileReadFields,
  next: UpdateProfileData,
): UpdateProfileData {
  const changes: UpdateProfileData = {};
  for (const key of profileKeys) {
    const value = next[key];
    if (value !== undefined && comparable(key, value) !== comparable(key, original[key])) {
      changes[key] = value;
    }
  }
  return changes;
}

export function exactProfileReadbackMatches(
  changes: UpdateProfileData,
  saved: ProfileReadFields | null | undefined,
): boolean {
  if (!saved) return false;
  return profileKeys.every(
    (key) =>
      changes[key] === undefined || comparable(key, changes[key]) === comparable(key, saved[key]),
  );
}
