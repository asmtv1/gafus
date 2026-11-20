/** Legacy tests only. Production injects preventionRows into Hono/Journal. */
import { registerPreventionRowsPort } from "@gafus/core/services/petPrevention";
import { preventionRows } from "./prevention-rows-instance.js";
registerPreventionRowsPort(preventionRows);
