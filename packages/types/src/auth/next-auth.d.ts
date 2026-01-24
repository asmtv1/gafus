export interface AuthUser {
  avatarUrl?: string | null;
  id: string;
  username: string;
  role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
  name?: string | null;
  email?: string | null;
  image?: string | null;
}
export interface Session {
  user: AuthUser;
}
export interface User extends AuthUser {}
export interface JWT extends AuthUser {}
declare global {
  interface Window {
    nextAuth?: {
      Session: Session;
      User: User;
      JWT: JWT;
    };
  }
}
//# sourceMappingURL=next-auth.d.ts.map
