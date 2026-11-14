/** Bind exact owner + course/day/step occurrence reads to SQL with the Core
 * policy callbacks. A trial, global Step ID or thumbnail URL never grants
 * payment access. This module is a process composition root before Hono.
 */
import {
  registerCourseOccurrenceReadsPort,
  type CourseOccurrenceReadsPort,
} from "@gafus/core/services/contentAccess";
import {
  readActiveCourseStepGafusGrant,
  readAllowedVideoCourseStepAccess,
} from "@gafus/entitlements-server";

const occurrenceReads: CourseOccurrenceReadsPort = {
  readActiveCourseStepGafusGrant: readActiveCourseStepGafusGrant as unknown as CourseOccurrenceReadsPort["readActiveCourseStepGafusGrant"],
  readAllowedVideoCourseStepAccess: readAllowedVideoCourseStepAccess as unknown as CourseOccurrenceReadsPort["readAllowedVideoCourseStepAccess"],
};
registerCourseOccurrenceReadsPort(occurrenceReads);
