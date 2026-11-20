/** Explicit API-owned SQL reader for occurrence-specific entitlements.
 * Every access retains Core's target and policy callbacks within one DB reader.
 * This module has no process-global registration side effects. */
import type { CourseOccurrenceReadsPort } from "@gafus/core/services/contentAccess";
import {
  readActiveCourseStepGafusGrant,
  readAllowedVideoCourseStepAccess,
} from "@gafus/entitlements-server";

export const occurrenceReadPort: CourseOccurrenceReadsPort = {
  readActiveCourseStepGafusGrant:
    readActiveCourseStepGafusGrant as unknown as CourseOccurrenceReadsPort["readActiveCourseStepGafusGrant"],
  readAllowedVideoCourseStepAccess:
    readAllowedVideoCourseStepAccess as unknown as CourseOccurrenceReadsPort["readAllowedVideoCourseStepAccess"],
};
