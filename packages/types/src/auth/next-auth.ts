// Типы для next-auth - заглушки без module augmentation
// В runtime эти типы будут заменены на реальные типы next-auth

export interface AuthUser {
  avatarUrl?: string | null;
  id: string;
  username: string;
  role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
  // Сохраняем совместимость с базовыми полями next-auth
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

// Экспортируем типы для использования в других пакетах
export interface Session {
  user: AuthUser;
}

export interface User extends AuthUser {}
export interface JWT extends AuthUser {}

// Глобальные типы для совместимости
declare global {
  interface Window {
    nextAuth?: {
      Session: Session;
      User: User;
      JWT: JWT;
    };
  }
}
