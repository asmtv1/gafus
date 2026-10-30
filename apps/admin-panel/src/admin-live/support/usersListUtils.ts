export interface AdminUserListItem {
  id: string;
  username: string;
  email: string | null;
  role: string;
  registrationChannel: string;
  createdAt: Date;
  profile?: {
    fullName?: string | null;
  } | null;
  _count: {
    pushSubscriptions: number;
  };
  savedRegistrationPromoCode: { code: string } | null;
}

export type UserSortField =
  | "username"
  | "role"
  | "email"
  | "registrationChannel"
  | "promoCode"
  | "notifications"
  | "createdAt"
  | null;

export type SortDirection = "asc" | "desc";

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("ru") ?? "";
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return collator.compare(normalized(a), normalized(b));
}

function getSortValue(user: AdminUserListItem, field: Exclude<UserSortField, null>) {
  switch (field) {
    case "username":
      return user.profile?.fullName || user.username;
    case "role":
      return user.role;
    case "email":
      return user.email;
    case "registrationChannel":
      return user.registrationChannel;
    case "promoCode":
      return user.savedRegistrationPromoCode?.code;
    case "notifications":
      return user._count.pushSubscriptions > 0 ? 1 : 0;
    case "createdAt":
      return new Date(user.createdAt).getTime();
  }
}

export function filterAndSortUsers<T extends AdminUserListItem>(
  users: T[],
  query: string,
  sortField: UserSortField,
  sortDirection: SortDirection,
): T[] {
  const normalizedQuery = normalized(query);
  const filteredUsers = normalizedQuery
    ? users.filter((user) =>
        [
          user.username,
          user.profile?.fullName,
          user.email,
          user.id,
          user.savedRegistrationPromoCode?.code,
        ].some((value) => normalized(value).includes(normalizedQuery)),
      )
    : users;

  if (!sortField) return filteredUsers;

  return [...filteredUsers].sort((a, b) => {
    const aValue = getSortValue(a, sortField);
    const bValue = getSortValue(b, sortField);
    const aIsMissing = aValue === null || aValue === undefined || aValue === "";
    const bIsMissing = bValue === null || bValue === undefined || bValue === "";

    if (aIsMissing !== bIsMissing) return aIsMissing ? 1 : -1;
    if (aIsMissing && bIsMissing) return 0;

    const comparison =
      typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : compareText(aValue as string | null | undefined, bValue as string | null | undefined);

    return sortDirection === "asc" ? comparison : -comparison;
  });
}
