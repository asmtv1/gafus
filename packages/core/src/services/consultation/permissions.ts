import type { UserRole as AuthRole } from "@gafus/prisma";

const ADMIN_ROLES: AuthRole[] = ["ADMIN", "MODERATOR"];

export function canAdminManageListed(role: AuthRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function canTrainerActAsCynologist(role: AuthRole): boolean {
  return role === "TRAINER" || role === "ADMIN" || role === "MODERATOR";
}

export function isTrainerOrAdmin(role: AuthRole): boolean {
  return role === "TRAINER" || role === "ADMIN" || role === "MODERATOR";
}
