import type { GafusUserRole as AuthRole } from "@gafus/types";

const ADMIN_ROLES: AuthRole[] = ["ADMIN"];

export function canAdminManageListed(role: AuthRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function canTrainerActAsCynologist(role: AuthRole): boolean {
  return role === "TRAINER" || role === "ADMIN";
}

export function isTrainerOrAdmin(role: AuthRole): boolean {
  return role === "TRAINER" || role === "ADMIN";
}
