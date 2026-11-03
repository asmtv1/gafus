import type { TrainerCourseFormData } from "./trainer-panel";

/**
 * AG1-002: approved *wire* READ DTOs for registered Trainer Hono producers.
 *
 * These are the public five/scalar-field projections; they are intentionally
 * distinct from legacy Prisma/UI domain models with Date objects, paths or PII.
 * Every timestamp is an ISO 8601 UTC string produced by Date#toISOString().
 * Runtime validation remains in the existing registered API producers.
 */
export interface TrainerReadSuccess<T> { success: true; data: T };

export interface TrainerVideoMetadataItem {
  id: string;
  displayName: string | null;
  transcodingStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  durationSec: number | null;
  createdAt: string;
};
export type TrainerVideoMetadataRead = TrainerReadSuccess<{
  videos: TrainerVideoMetadataItem[];
}>;

export interface TrainerNotesSummaryItem {
  id: string;
  title: string | null;
  tags: string[];
  createdAt: string;
};
export interface TrainerNotesSummaryPage {
  notes: TrainerNotesSummaryItem[];
  total: number;
  page: number;
  pageSize: number;
};
export type TrainerNotesSummaryRead = TrainerReadSuccess<TrainerNotesSummaryPage>;

export interface TrainerExamSummaryItem {
  id: string;
  createdAt: string;
  courseName: string;
  stepTitle: string;
  status: "IN_PROGRESS" | "COMPLETED";
  hasTestQuestions: boolean;
  requiresWrittenFeedback: boolean;
  requiresVideoReport: boolean;
};
export interface TrainerPendingExamSummaryItem {
  id: string;
  stepTitle: string;
  courseName: string;
  dayTitle: string;
  hasTestQuestions: boolean;
  hasWrittenFeedback: boolean;
  hasVideoReport: boolean;
  submittedAt: string;
};
export type TrainerExamSummaryRead =
  TrainerReadSuccess<TrainerExamSummaryItem[]>;
export type TrainerPendingExamSummaryRead =
  TrainerReadSuccess<TrainerPendingExamSummaryItem[]>;

export interface TrainerArticleOwnMetadataItem {
  id: string;
  title: string;
  slug: string;
  visibility: "PUBLIC" | "PAID";
  likeCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};
export type TrainerArticleOwnMetadataRead = TrainerReadSuccess<{
  articles: TrainerArticleOwnMetadataItem[];
}>;


/** Existing GET /trainer/courses/:id/version and name-only version CAS response. */
export interface TrainerCourseVersionName {
  id: string;
  name: string;
  version: number;
}
export type TrainerCourseVersionRead = TrainerReadSuccess<TrainerCourseVersionName>;

/** Only the existing name-only CAS conflict; never an edit-form write contract. */
export type TrainerCourseNameConflictCode = "STALE_VERSION";

/** Strict aggregate fields from registered GET /trainer/statistics/courses. */
export interface TrainerStatisticsCourse {
  id: string;
  name: string;
  logoImg: string;
  avgRating: number | null;
  isPrivate: boolean;
  isPaid: boolean;
  isPersonalized: boolean;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  totalUsers: number;
  completedUsers: number;
  inProgressUsers: number;
  notStartedUsers: number;
  author?: { username: string; fullName?: string | null };
}
export interface TrainerCourseStatisticsData {
  courses: TrainerStatisticsCourse[];
  totalCourses: number;
  totalDays: number;
}
export type TrainerCourseStatisticsRead =
  TrainerReadSuccess<TrainerCourseStatisticsData>;

/** Strict existing GET /trainer/statistics/steps (no invented progress). */
export interface TrainerStatisticsStep {
  id: string;
  title: string;
  durationSec: number | null;
  usedInDaysCount: number;
  usedInCoursesCount: number;
}
export interface TrainerStepStatisticsData {
  steps: TrainerStatisticsStep[];
  totalSteps: number;
  progressMetrics: "NOT_COMPUTED";
}
export type TrainerStepStatisticsRead =
  TrainerReadSuccess<TrainerStepStatisticsData>;

/** Frozen TR013 GET /trainer/steps: strict visible-step JSON projection. */
export interface TrainerVisibleStepItem {
  id: string; title: string; description: string;
  durationSec: number | null; estimatedDurationSec: number | null;
  type: string; videoUrl: string | null;
  imageUrls: string[]; pdfUrls: string[];
  checklist: unknown; surveySlug: string | null;
  isDailyCourse: boolean; authorId: string;
  createdAt: string; updatedAt: string;
  author: { username: string; profile: { fullName: string | null } | null };
  stepLinks: { day: { id?: string; title?: string; dayLinks: {
    course: { id: string; name: string; shortDesc: string; logoImg: string };
  }[] } }[];
}
export type TrainerVisibleStepsRead = TrainerReadSuccess<TrainerVisibleStepItem[]>;

/** Frozen TR013 GET /trainer/templates: strict public-template JSON projection. */
export interface TrainerPublicStepTemplateItem {
  id: string;
  title: string;
  description: string;
  durationSec: number | null;
  type: string;
  imageUrls: string[];
  pdfUrls: string[];
  videoUrl: string | null;
  checklist: unknown;
  requiresVideoReport: boolean;
  requiresWrittenFeedback: boolean;
  hasTestQuestions: boolean;
  surveySlug: string | null;
  tags: string[];
  isPublic: true;
  usageCount: number;
  category: { id: string; name: string; icon: string | null } | null;
  author: { id: string; username: string };
  createdAt: string;
}
export type TrainerPublicStepTemplatesRead =
  TrainerReadSuccess<TrainerPublicStepTemplateItem[]>;

/** Existing registered GET /trainer/days: strict visible-day JSON metadata. */
export interface TrainerVisibleDayItem {
  id: string; title: string; equipment: string; description: string;
  type: string; authorId: string;
  showCoursePathExport: boolean; shareProgressAcrossCourses: boolean;
  createdAt: string; updatedAt: string;
  author: { username: string; profile: { fullName: string | null } | null };
  stepLinks: { id: string; order: number; step: { id: string; title: string } }[];
  dayLinks: { id: string; order: number; course: { id: string; name: string } }[];
}
export type TrainerVisibleDaysRead = TrainerReadSuccess<TrainerVisibleDayItem[]>;

/** Existing TR014 GET /trainer/daily-course/candidates: frozen metadata. */
export interface TrainerDailyCandidateItem {
  id: string;
  title: string;
  type: string;
  stepsCount: number;
  authorId: string;
  authorUsername: string;
}
export type TrainerDailyCandidatesRead =
  TrainerReadSuccess<TrainerDailyCandidateItem[]>;

/** Existing TR014 GET /trainer/daily-course/bundles: candidate plus steps. */
export interface TrainerDailyBundleItem extends TrainerDailyCandidateItem {
  equipment: string;
  description: string;
  steps: {
    id: string;
    title: string;
    type: string;
    order: number;
  }[];
}
export type TrainerDailyBundlesRead =
  TrainerReadSuccess<TrainerDailyBundleItem[]>;

/** Existing TR014 GET /trainer/daily-course/bundle-step-candidates. */
export interface TrainerDailyBundleStepCandidateItem {
  id: string;
  title: string;
  type: string;
  durationSec: number | null;
  authorId: string;
  authorUsername: string;
}
export type TrainerDailyBundleStepCandidatesRead =
  TrainerReadSuccess<TrainerDailyBundleStepCandidateItem[]>;

/** Existing TR014 GET /trainer/daily-course/schedule-range (date YYYY-MM-DD). */
export interface TrainerDailyScheduleItem {
  id: string;
  date: string;
  isPublished: boolean;
  bundle: {
    id: string;
    title: string;
    type: string;
    stepsCount: number;
  };
  createdBy: {
    id: string;
    username: string;
  };
}
export type TrainerDailyScheduleRangeRead =
  TrainerReadSuccess<TrainerDailyScheduleItem[]>;

/** Existing TR012 GET /trainer/courses/:courseId/draft: 16 projected wire fields. */
export interface TrainerCourseDraftItem {
  id: string;
  name: string;
  guideContent: string | null;
  shortDesc: string;
  description: string;
  duration: string;
  videoUrl: string | null;
  logoImg: string;
  isPrivate: boolean;
  isPaid: boolean;
  showInProfile: boolean;
  isPersonalized: boolean;
  equipment: string;
  trainingLevel: string;
  dayLinks: { id: string; dayId: string; order: number; day: { id: string; title: string } }[];
  access: { userId: string; user: { id: string; username: string } }[];
}
export type TrainerCourseDraftRead = TrainerReadSuccess<TrainerCourseDraftItem>;

/** Existing TR012 GET /trainer/courses/:courseId/editor-snapshot: draft + version. */
export interface TrainerCourseEditorSnapshotItem extends TrainerCourseDraftItem {
  version: number;
}
export type TrainerCourseEditorSnapshotRead =
  TrainerReadSuccess<TrainerCourseEditorSnapshotItem>;

/** COURSE031: exact accepted default-OFF free/public/nonmedia POST JSON input.
 * Unlike Core create input, the server (never the browser) provides id/authorId.
 * Zod-defaulted metadata is optional on the wire; the five restrictions are not.
 * This is a TypeScript contract, NOT runtime validation or a write grant.
 */
export interface TrainerCourseFormCreateWireRequest {
  name: string;
  duration: string;
  isPublic: true;
  isPaid: false;
  logoImg: "";
  videoUrl: null;
  allowedUsers: [];
  guideContent?: string | null;
  shortDesc?: string;
  description?: string;
  showInProfile?: boolean;
  isPersonalized?: boolean;
  trainingDays?: string[];
  equipment?: string;
  trainingLevel?: TrainerCourseFormData["trainingLevel"];
}

/** COURSE031: PUT uses the course ID in the URL and the coherent GET revision. */
export interface TrainerCourseFormUpdateWireRequest
  extends TrainerCourseFormCreateWireRequest {
  expectedVersion: TrainerCourseEditorSnapshotItem["version"];
}

/** COURSE031 POST 201; Core create returns only id, no version in this ACK. */
export type TrainerCourseFormCreateWireSuccess = TrainerReadSuccess<{ id: string }>;

/** COURSE031 PUT 200; the post-write version is returned from Core CAS. */
export type TrainerCourseFormUpdateWireSuccess = TrainerReadSuccess<{
  id: string;
  version: number;
}>;
