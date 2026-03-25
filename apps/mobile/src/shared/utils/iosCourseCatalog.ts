import { Platform } from "react-native";

import type { Course } from "@/shared/lib/api";
import type { PublicProfileCourse } from "@/shared/lib/api/user";

function isCourseVisibleOnIos(isPaid: boolean, hasAccess?: boolean): boolean {
  if (Platform.OS !== "ios") {
    return true;
  }
  return !isPaid || hasAccess === true;
}

/**
 * На iOS в каталоге не показываем платные курсы без доступа (витрина только на web).
 * Android и остальные платформы — без изменений.
 */
export function filterCoursesForIosCatalog(courses: Course[]): Course[] {
  return courses.filter((c) => isCourseVisibleOnIos(c.isPaid, c.hasAccess));
}

/** Блок «Курсы кинолога» в публичном профиле — та же логика, что и список курсов. */
export function filterPublicProfileCoursesForIos(
  courses: PublicProfileCourse[],
): PublicProfileCourse[] {
  return courses.filter((c) => isCourseVisibleOnIos(c.isPaid, c.hasAccess));
}
