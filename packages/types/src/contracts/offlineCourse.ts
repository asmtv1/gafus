/** JSON download contract; timestamps remain ISO strings, never ORM Date values. */
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
    showCoursePathExport?: boolean;
    steps: {
      id: string;
      stepOnDayId?: string;
      offlineProgressVersion?: string;
      order: number;
      title: string;
      description: string;
      type: string;
      durationSec: number | null;
      estimatedDurationSec: number | null;
      videoUrl: string | null;
      videoUrls?: string[];
      imageUrls: string[];
      pdfUrls: string[];
      checklist: unknown;
      requiresVideoReport: boolean;
      requiresWrittenFeedback: boolean;
      hasTestQuestions: boolean;
      surveySlug: string | null;
    }[];
  }[];
  mediaFiles: {
    videos: string[];
    images: string[];
    pdfs: string[];
  };
}

export interface VersionResponse { version: string; }
export interface UpdatesResponse { hasUpdates: boolean; serverVersion: string; }
