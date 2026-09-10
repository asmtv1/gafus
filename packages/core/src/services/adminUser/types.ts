export interface AdminUserRow {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: string;
  /** Канал регистрации (web / ios / android / неизвестно для старых аккаунтов) */
  registrationChannel: string;
  createdAt: Date;
  profile: { fullName: string | null; avatarUrl: string | null } | null;
  _count: { pushSubscriptions: number };
  partnerProfile?: { promoCodeId: string | null; promoCode: { id: string; code: string; discountPercent: number } | null } | null;
}

export type AdminUserRole = "ADMIN" | "MODERATOR" | "TRAINER" | "PARTNER" | "USER";

export interface UpdateUserAdminInput {
  username?: string;
  email?: string | null;
  phone?: string;
  role?: AdminUserRole;
  newPassword?: string;
  /** Existing active promo selected when appointing or changing a partner. */
  partnerPromoCodeId?: string;
}

export type AdminUserActionResult =
  | { success: true; data: AdminUserRow[] }
  | { success: false; error: string };

export type AdminUserUpdateResult = { success: true } | { success: false; error: string };

export type AdminUserDeleteResult = { success: true } | { success: false; error: string };
