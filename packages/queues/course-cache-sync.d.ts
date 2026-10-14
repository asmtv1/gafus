/**
 * Compatibility shim for the existing Next.js projects using legacy
 * moduleResolution: "Node" (which ignores package.json "exports").
 * At runtime the package exports map resolves to dist/course-cache-sync.js.
 */
export {
  bumpCourseContentRevision,
  readCourseContentRevision,
} from "./dist/course-cache-sync";
