/** Deprecated registration shim used only by legacy isolated tests.
 * The production API imports offline-mutation-rows-instance explicitly. */
import { registerOfflineMutationRowsPort } from "@gafus/core/services/offline";
import { offlineMutationRows } from "./offline-mutation-rows-instance.js";
registerOfflineMutationRowsPort(offlineMutationRows);
