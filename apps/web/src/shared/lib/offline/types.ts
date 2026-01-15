// Типы для офлайн-хранения курсов

export interface OfflineCourse {
  courseId: string;
  courseType: string;
  version: string; // updatedAt в ISO строке
  downloadedAt: number; // timestamp
  // HTML страниц курса для офлайн-доступа (опционально, резервный вариант)
  htmlPages?: {
    listPage?: string; // HTML страницы списка дней курса (/trainings/[courseType])
    dayPages?: Record<string, string>; // HTML страниц дней (/trainings/[courseType]/[dayId])
  };
  course: {
    metadata: {
      id: string;
      type: string;
      name: string;
      description: string;
      shortDesc: string;
      duration: string;
      logoImg: string;
      isPrivate: boolean;
      isPaid: boolean;
      avgRating: number | null;
      trainingLevel: string;
      createdAt: string;
      updatedAt: string;
      authorUsername: string;
      videoUrl: string | null;
      equipment: string | null;
    };
    trainingDays: {
      id: string;
      order: number;
      title: string;
      description: string;
      equipment: string;
      type: string;
      steps: {
        id: string;
        order: number;
        title: string;
        description: string;
        type: string;
        durationSec: number | null;
        estimatedDurationSec: number | null;
        videoUrl: string | null;
        imageUrls: string[];
        pdfUrls: string[];
        checklist: unknown;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
      }[];
    }[];
    steps: {
      id: string;
      order: number;
      title: string;
      description: string;
      type: string;
      durationSec: number | null;
      estimatedDurationSec: number | null;
      videoUrl: string | null;
      imageUrls: string[];
      pdfUrls: string[];
      checklist: unknown;
      requiresVideoReport: boolean;
      requiresWrittenFeedback: boolean;
      hasTestQuestions: boolean;
    }[];
  };
  mediaFiles: {
    hlsVideos: Record<string, {
      manifest: string; // Текст манифеста
      segments: Record<string, Blob>; // Сегменты
      videoId: string; // ID видео
      thumbnailPath?: string; // Путь к thumbnail (для получения из images)
    }>;
    images: Record<string, Blob>; // Изображения, включая thumbnail видео (ключ = thumbnailPath)
    pdfs: Record<string, Blob>;
    externalVideos?: Record<string, string>; // URL внешних видео (YouTube, RuTube, VK и т.д.)
  };
}

export interface FullCourseData {
  course: {
    id: string;
    type: string;
    name: string;
    description: string;
    shortDesc: string;
    duration: string;
    logoImg: string;
    isPrivate: boolean;
    isPaid: boolean;
    avgRating: number | null;
    trainingLevel: string;
    createdAt: string;
    updatedAt: string;
    authorUsername: string;
    videoUrl: string | null;
    equipment: string | null;
  };
  trainingDays: {
    id: string;
    order: number;
    title: string;
    description: string;
    equipment: string;
    type: string;
    steps: {
      id: string;
      order: number;
      title: string;
      description: string;
      type: string;
      durationSec: number | null;
      estimatedDurationSec: number | null;
      videoUrl: string | null;
      imageUrls: string[];
      pdfUrls: string[];
      checklist: unknown;
      requiresVideoReport: boolean;
      requiresWrittenFeedback: boolean;
      hasTestQuestions: boolean;
    }[];
  }[];
  mediaFiles: {
    videos: string[];
    images: string[];
    pdfs: string[];
  };
}
