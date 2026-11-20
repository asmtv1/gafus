/** Deprecated compatibility shim for legacy isolated tests. Not imported by
 * production app.ts: runtime Hono factories receive an explicit typed port. */
import { registerCourseVersionRowsPort } from "@gafus/core/services/trainerCourse";
import { courseVersionRowsPort } from "./course-version-rows-instance.js";
registerCourseVersionRowsPort(courseVersionRowsPort);
