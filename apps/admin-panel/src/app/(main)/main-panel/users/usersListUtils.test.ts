import { describe, expect, it } from "vitest";

import { filterAndSortUsers } from "./usersListUtils";

const users = [
  {
    id: "user-1",
    username: "zoe",
    email: "zoe@example.com",
    role: "USER",
    registrationChannel: "IOS",
    createdAt: new Date("2026-09-24T10:00:00Z"),
    profile: { fullName: "Зоя" },
    _count: { pushSubscriptions: 0 },
    savedRegistrationPromoCode: null,
  },
  {
    id: "user-2",
    username: "anna",
    email: "anna@example.com",
    role: "TRAINER",
    registrationChannel: "ANDROID",
    createdAt: new Date("2026-09-26T10:00:00Z"),
    profile: { fullName: "Анна" },
    _count: { pushSubscriptions: 1 },
    savedRegistrationPromoCode: { code: "AUTUMN20" },
  },
  {
    id: "user-3",
    username: "boris",
    email: null,
    role: "USER",
    registrationChannel: "WEB",
    createdAt: new Date("2026-09-25T10:00:00Z"),
    profile: null,
    _count: { pushSubscriptions: 0 },
    savedRegistrationPromoCode: { code: "BETA" },
  },
];

describe("filterAndSortUsers", () => {
  it("finds users by name, email, ID, and registration promo code", () => {
    expect(filterAndSortUsers(users, "анна", null, "asc")).toHaveLength(1);
    expect(filterAndSortUsers(users, "example.com", null, "asc")).toHaveLength(2);
    expect(filterAndSortUsers(users, "user-3", null, "asc")[0]?.username).toBe("boris");
    expect(filterAndSortUsers(users, "autumn", null, "asc")[0]?.username).toBe("anna");
  });

  it("sorts the whole filtered collection by promo code and keeps missing values last", () => {
    expect(filterAndSortUsers(users, "", "promoCode", "asc").map((user) => user.username)).toEqual([
      "anna",
      "boris",
      "zoe",
    ]);
    expect(filterAndSortUsers(users, "", "promoCode", "desc").map((user) => user.username)).toEqual([
      "boris",
      "anna",
      "zoe",
    ]);
  });

  it("sorts dates and notification status in either direction", () => {
    expect(filterAndSortUsers(users, "", "createdAt", "desc")[0]?.username).toBe("anna");
    expect(filterAndSortUsers(users, "", "notifications", "desc")[0]?.username).toBe("anna");
  });
});
