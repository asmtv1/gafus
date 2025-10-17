/**
 * Типы для re-engagement системы
 */

export type MessageType = 'emotional' | 'educational' | 'motivational' | 'mixed';

export type NotificationLevel = 1 | 2 | 3 | 4;

export interface MessageVariant {
  id: string;
  type: MessageType;
  level: NotificationLevel;
  title: string;
  body: string;
  conditions?: {
    requiresCompletedCourses?: boolean;
    requiresDogName?: boolean;
    minSteps?: number;
    maxSteps?: number;
  };
  urlTemplate: string;
  emoji?: string;
  priority?: number;
}

export interface UserData {
  userId: string;
  username: string;
  dogName?: string;
  completedCourses: {
    id: string;
    name: string;
    rating: number;
  }[];
  totalSteps: number;
  lastCourse?: string;
  platformStats?: {
    weeklyCompletions: number;
    activeTodayUsers: number;
  };
}

export interface PersonalizedMessage {
  title: string;
  body: string;
  url: string;
  data: Record<string, unknown>;
}

export interface InactiveUser {
  userId: string;
  lastActivityDate: Date;
  daysSinceActivity: number;
  totalCompletions: number;
  hasActiveCampaign: boolean;
}

export interface CampaignData {
  id: string;
  userId: string;
  currentLevel: NotificationLevel;
  sentVariantIds: string[];
  lastActivityDate: Date;
}

export interface ReengagementJobData {
  campaignId: string;
  userId: string;
  level: NotificationLevel;
}

