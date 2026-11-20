/** Legacy test-only composition; live Hono uses explicit vetVisitRows. */
import { registerVetVisitRowsPort } from "@gafus/core/services/pets";
import { vetVisitRows } from "./vet-visit-rows-instance.js";
registerVetVisitRowsPort(vetVisitRows);
