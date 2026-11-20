/** Transport auth DTOs; not tied to NextAuth or any browser global. */
export interface AuthUser {
  avatarUrl?: string | null;
  id: string;
  username: string;
  role: "USER" | "PARTNER" | "ADMIN" | "MODERATOR" | "TRAINER";
  needsPhone?: boolean;
  passwordSetAt?: Date | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface Session {
  user: AuthUser;
}

export interface User extends AuthUser {}
export interface JWT extends AuthUser {}
