export interface AdminUserRow {
  id: string;
  username: string;
  phone: string | null;
  role: string;
  isConfirmed: boolean;
  createdAt: Date;
  profile: { fullName: string | null; avatarUrl: string | null } | null;
  _count: { pushSubscriptions: number };
}

export type AdminUserRole = "ADMIN" | "MODERATOR" | "TRAINER" | "USER";

export interface UpdateUserAdminInput {
  username?: string;
  phone?: string;
  role?: AdminUserRole;
  newPassword?: string;
}

export type AdminUserActionResult =
  | { success: true; data: AdminUserRow[] }
  | { success: false; error: string };

export type AdminUserUpdateResult = { success: true } | { success: false; error: string };

export type AdminUserDeleteResult = { success: true } | { success: false; error: string };
