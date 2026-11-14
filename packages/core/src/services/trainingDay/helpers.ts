/** Pure projection port; persistence lives outside Core, in course-read-server. */
export interface TrainingDayCourseLookupPort {
  listCourseIdsForTrainingDay: (dayId: string) => Promise<string[]>;
}

/** Empty input and duplicate course links preserve the former SQL reader wire. */
export async function getCoursesUsingDay(
  dayId: string,
  reads: TrainingDayCourseLookupPort,
): Promise<string[]> {
  if (!dayId) return [];
  return Array.from(new Set(await reads.listCourseIdsForTrainingDay(dayId)));
}
