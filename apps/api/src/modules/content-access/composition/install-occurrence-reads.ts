/** Legacy test/compatibility entrypoint, not used by production app.ts.
 * Production services receive occurrenceReadPort through explicit composition. */
import { registerCourseOccurrenceReadsPort } from "@gafus/core/services/contentAccess";
import { occurrenceReadPort } from "./occurrence-reads-instance.js";
registerCourseOccurrenceReadsPort(occurrenceReadPort);
