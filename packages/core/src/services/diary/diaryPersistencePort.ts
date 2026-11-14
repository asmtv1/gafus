/** Database-free diary persistence contract; owner/course ACL remains Core-owned. */
export interface DiaryEntryWithDay {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  dayId: string;
  dayOnCourseId: string;
  dayOrder: number;
  dayTitle: string;
}
export interface DiaryPersistencePort {
  /** Exact ID first, then legacy course type. */
  resolveDiaryCourseId(courseIdOrType: string): Promise<string | null>;
  /** Course occurrence, NOT globally shared dayId. */
  readDiaryDayOccurrence(dayOnCourseId: string): Promise<{
    dayId: string;
    courseId: string;
  } | null>;
  /** Owner is an explicit predicate in the SQL upsert. */
  writeDiaryUserDay(userId: string, dayId: string, content: string): Promise<unknown>;
  /** Always owner+course scoped; up-to cutoff belongs to that course. */
  readDiaryCourseEntries(
    userId: string,
    courseId: string,
    upToDayOnCourseId?: string,
  ): Promise<DiaryEntryWithDay[]>;
}
