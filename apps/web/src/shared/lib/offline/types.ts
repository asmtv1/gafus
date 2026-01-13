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
    videos: Record<string, Blob>;
    images: Record<string, Blob>;
    pdfs: Record<string, Blob>;
    externalVideos?: Record<string, string>; // URL внешних видео (YouTube, RuTube, VK и т.д.)
    hls: Record<string, HLSManifestCache>; // HLS кэш для новых видео
  };
}

/**
 * Кэш HLS манифеста и сегментов
 */
export interface HLSManifestCache {
  manifestUrl: string; // Оригинальный URL манифеста
  manifest: string; // Содержимое playlist.m3u8
  segments: Record<string, Blob>; // { "segment-000.ts": Blob, ... }
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
