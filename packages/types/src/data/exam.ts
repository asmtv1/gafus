/**
 * Existing GET /api/v1/exam/result successful JSON wire.
 * Core returns Date for reviewedAt/createdAt/updatedAt; Hono c.json emits
 * ISO strings. No fields are added, filtered, transformed or populated here.
 * A missing exam stays HTTP 404, never success with data: null.
 */
export interface ExamResultWire {
  id: string;
  testAnswers: Record<string, number> | null;
  testScore: number | null;
  testMaxScore: number | null;
  /** Opaque existing URL; the GET transport does not rewrite or activate it. */
  videoReportUrl: string | null;
  writtenFeedback: string | null;
  overallScore: number | null;
  isPassed: boolean | null;
  trainerComment: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewedBy: {
    username: string;
    profile: { fullName: string | null } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExamResultRead {
  success: true;
  data: ExamResultWire;
}
