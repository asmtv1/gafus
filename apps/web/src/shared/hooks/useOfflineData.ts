import { useOfflineStore } from "@/shared/stores/offlineStore";

interface StepCompletionData {
  stepId: string;
  courseId: string;
  userId: string;
  completedAt: Date;
}

interface ProfileUpdateData {
  userId: string;
  updates: {
    name?: string;
    bio?: string;
    avatarUrl?: string;
  };
}

interface CommentData {
  courseId: string;
  userId: string;
  content: string;
  rating?: number;
}

interface RatingData {
  courseId: string;
  userId: string;
  rating: number;
  comment?: string;
}

type OfflineDataType = StepCompletionData | ProfileUpdateData | CommentData | RatingData;

export function useOfflineData() {
  const { addToSyncQueue } = useOfflineStore();

  const saveOffline = (type: string, data: OfflineDataType) => {
    // Сохраняем данные в localStorage для offline использования
    const key = `gafus-offline-${type}`;
    const existing = localStorage.getItem(key);
    const items = existing ? JSON.parse(existing) : [];
    items.push({ ...data, timestamp: Date.now() });
    localStorage.setItem(key, JSON.stringify(items));
  };

  // Экспортируем функции, чтобы использовать их снаружи и избежать неиспользуемых переменных
  return { addToSyncQueue, saveOffline };
}
