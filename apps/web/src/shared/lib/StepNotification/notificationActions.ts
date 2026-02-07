"use server";

import {
  pauseNotificationAction as pauseFromServer,
  resetNotificationAction as resetFromServer,
  resumeNotificationAction as resumeFromServer,
} from "@shared/server-actions/notifications";

export async function pauseNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
) {
  return pauseFromServer(courseId, dayOnCourseId, stepIndex);
}

export async function resetNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
) {
  return resetFromServer(courseId, dayOnCourseId, stepIndex);
}

export async function resumeNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  durationSec: number,
) {
  return resumeFromServer(courseId, dayOnCourseId, stepIndex, durationSec);
}
