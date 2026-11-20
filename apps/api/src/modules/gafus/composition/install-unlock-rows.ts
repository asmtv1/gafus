/** Legacy test-only compatibility; API injects unlockRows explicitly. */
import { registerGafusUnlockRowsPort } from "@gafus/core/services/gafus";
import { unlockRows } from "./unlock-rows-instance.js";
registerGafusUnlockRowsPort(unlockRows);
