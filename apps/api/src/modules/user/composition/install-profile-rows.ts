/** Legacy test-only composition shim. Runtime injects profileRows directly. */
import { registerProfileRowsPort } from "@gafus/core/services/user";
import { profileRows } from "./profile-rows-instance.js";
registerProfileRowsPort(profileRows);
