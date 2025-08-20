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

  const completeStepOffline = (data: StepCompletionData) => {
    // Добавляем в очередь синхронизации
    addToSyncQueue({
      type: "step-completion",
      data,
      maxRetries: 3,
    });

    // Сохраняем локально
    saveOffline("step-completion", data);
  };

  const updateProfileOffline = (profileData: ProfileUpdateData) => {
    // Добавляем в очередь синхронизации
    addToSyncQueue({
      type: "profile-update",
      data: profileData,
      maxRetries: 3,
    });

    // Сохраняем локально
    saveOffline("profile-update", profileData);
  };

  const addCommentOffline = (data: CommentData) => {
    // Добавляем в очередь синхронизации
    addToSyncQueue({
      type: "comment",
      data,
      maxRetries: 3,
    });

    // Сохраняем локально
    saveOffline("comment", data);
  };

  const addRatingOffline = (data: RatingData) => {
    // Добавляем в очередь синхронизации
    addToSyncQueue({
      type: "rating",
      data,
      maxRetries: 3,
    });

    // Сохраняем локально
    saveOffline("rating", data);
  };

  return {
    completeStepOffline,
    updateProfileOffline,
    addCommentOffline,
    addRatingOffline,
  };
}
