import type { CynologistIntake } from "./intake";
export const CHAT_LIMITS = {
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  videoSeconds: 120,
  textLength: 5000,
} as const;
export const CHAT_REPLY_COPY = "Ответ в течение суток";
export const CHAT_HOURS_COPY = "Кинолог отвечает с 14:00 до 20:00 МСК. Выходной — понедельник.";
export interface CynologistChatDto {
  id: string;
  streamChannelId: string;
  clientUserId: string;
  trainerUserId: string;
  intake: CynologistIntake;
  provisionStatus: string;
  lastMessageAt: string | null;
  unreadCount: number;
}
export interface CynologistChatStateDto {
  enabled: boolean;
  isAssignedTrainer: boolean;
  canUseCynologistChat: boolean;
  canBookConsultations: boolean;
  canSend: boolean;
  needsIntake: boolean;
  chat: CynologistChatDto | null;
}
export interface CynologistChatSessionDto {
  apiKey: string;
  userId: string;
  token: string;
  expiresAt: string;
  channelType: string;
  channelId: string;
}
export const COMMUNITY_CHAT_RULES =
  "В чате запрещены оскорбления, реклама и нецензурные выражения. За нарушение правил — блокировка.";
export interface CommunityModerationDto {
  messages: {
    id: string;
    userId: string;
    username: string;
    text: string;
    createdAt?: string | Date;
  }[];
  cursor: string | null;
  bans: { userId: string; username: string }[];
}
export interface CommunityChatStateDto {
  isModerator: boolean;
  isBanned: boolean;
  enabled: boolean;
  canSend: boolean;
}

/** Same reaction identifiers on the API and both chat clients. */
export const CHAT_REACTIONS = [
  { type: "like", emoji: "👍", label: "Нравится" },
  { type: "love", emoji: "❤️", label: "Сердце" },
  { type: "haha", emoji: "😂", label: "Смех" },
  { type: "wow", emoji: "😮", label: "Удивление" },
  { type: "sad", emoji: "😢", label: "Грусть" },
  { type: "pray", emoji: "🙏", label: "Спасибо" },
  { type: "fire", emoji: "🔥", label: "Огонь" },
  { type: "clap", emoji: "👏", label: "Аплодисменты" },
  { type: "party", emoji: "🎉", label: "Праздник" },
  { type: "hundred", emoji: "💯", label: "Сто процентов" },
  { type: "heart_eyes", emoji: "😍", label: "Восхищение" },
  { type: "thinking", emoji: "🤔", label: "Размышление" },
  { type: "dislike", emoji: "👎", label: "Не нравится" },
  { type: "angry", emoji: "😡", label: "Злость" },
  { type: "cry", emoji: "😭", label: "Слёзы" },
  { type: "smile", emoji: "😁", label: "Улыбка" },
  { type: "cool", emoji: "😎", label: "Круто" },
  { type: "hug", emoji: "🤗", label: "Обнимаю" },
  { type: "ok", emoji: "👌", label: "Хорошо" },
  { type: "salute", emoji: "🫡", label: "Есть" },
  { type: "dog", emoji: "🐶", label: "Собака" },
  { type: "paw", emoji: "🐾", label: "Лапки" },
  { type: "trophy", emoji: "🏆", label: "Победа" },
  { type: "sparkles", emoji: "✨", label: "Волшебство" },
] as const;

export type ChatDisplayRole = "admin" | "trainer" | "subscriber";
export const CHAT_ROLE_LABELS: Record<ChatDisplayRole, string> = {
  admin: "Администратор",
  trainer: "Кинолог",
  subscriber: "Подписчик",
};
