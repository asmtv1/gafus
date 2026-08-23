type CourseParticipationSummary = {
  startedUsersCount?: number;
  userCourses?: { status: string }[];
};

export function getCourseStartedUsersCount(course: CourseParticipationSummary): number {
  if (typeof course.startedUsersCount === "number" && Number.isFinite(course.startedUsersCount)) {
    return course.startedUsersCount;
  }

  return (
    course.userCourses?.filter(
      (entry) => entry.status === "IN_PROGRESS" || entry.status === "COMPLETED",
    ).length ?? 0
  );
}
