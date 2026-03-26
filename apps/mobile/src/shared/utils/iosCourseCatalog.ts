import { Platform } from "react-native";

import type { Course } from "@/shared/lib/api/courses";
import type { PublicProfileCourse } from "@/shared/lib/api/user";

/**
 * В общем каталоге на iOS скрываем платные курсы без оплаты/доступа.
 * На Android, web и других платформах список не меняем.
 */
export function filterCoursesForIosCatalog(courses: Course[]): Course[] {
  if (Platform.OS !== "ios") {
    return courses;
  }
  return courses.filter((c) => !c.isPaid || c.hasAccess === true);
}

/**
 * Курсы кинолога в публичном профиле: на iOS те же правила, что в каталоге.
 * Публичный API не отдаёт hasAccess — сверяем с GET /courses (тип курса → доступ).
 */
export function filterTrainerProfileCoursesForIos(
  profileCourses: PublicProfileCourse[],
  catalogCourses: Course[] | undefined,
): PublicProfileCourse[] {
  if (Platform.OS !== "ios") {
    return profileCourses;
  }
  const accessByType = new Map<string, boolean>();
  for (const c of catalogCourses ?? []) {
    accessByType.set(c.type, !c.isPaid || c.hasAccess === true);
  }
  return profileCourses.filter((pc) => {
    if (!pc.isPaid) return true;
    return accessByType.get(pc.type) === true;
  });
}
