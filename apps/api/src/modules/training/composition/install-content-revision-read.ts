/** Backwards-compatible registrar for isolated legacy tests only. The API
 * composition root uses `training-content-rows-instance` directly. */
import { registerCourseContentRevisionReadPort } from "@gafus/core/services/training";
import { contentRevisionReadPort } from "./training-content-rows-instance.js";
registerCourseContentRevisionReadPort(contentRevisionReadPort);
