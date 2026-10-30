export type AuthRole = "USER" | "PARTNER" | "ADMIN" | "MODERATOR" | "TRAINER";
export interface AuthUser {
  id: string;
  username: string;
  role: AuthRole;
  needsPhone?: boolean;
}
