import type { CynologistIntake } from "./intake";
export const CHAT_LIMITS = {
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  videoSeconds: 120,
  textLength: 5000,
} as const;
export const CHAT_REPLY_COPY = "Ответ в течение суток";
export const CHAT_HOURS_COPY = "Кинолог отвечает в рабочие дни с 10:00 до 19:00 МСК";
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
