import type { CourseWithProgressData } from "@gafus/types";
import type { CourseTabType } from "../components/CourseTabs/CourseTabs";

export function filterCoursesByTab(
  courses: CourseWithProgressData[],
  tab: CourseTabType
): CourseWithProgressData[] {
  switch (tab) {
    case "free":
      // Бесплатные курсы - те, которые не приватные и не платные
      return courses.filter(course => !course.isPrivate && !course.isPaid);
    
    case "paid":
      // Платные курсы - те, которые помечены как платные
      return courses.filter(course => course.isPaid);
    
    case "private":
      // Приватные курсы
      return courses.filter(course => course.isPrivate);
    
    default:
      return courses;
  }
}

export function getTabCounts(
  courses: CourseWithProgressData[]
): Record<CourseTabType, number> {
  return {
    free: courses.filter(course => !course.isPrivate && !course.isPaid).length,
    paid: courses.filter(course => course.isPaid).length,
    private: courses.filter(course => course.isPrivate).length,
  };
}
