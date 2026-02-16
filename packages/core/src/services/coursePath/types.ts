import type { DiaryEntryWithDay } from "../diary/diaryService";

export interface CoursePathEntry extends DiaryEntryWithDay {
  contentExcerpt: string;
}

export interface CoursePathData {
  courseName: string;
  courseType: string;
  startedAt: Date | null;
  completedAt: Date | null;
  entries: CoursePathEntry[];
}
