/** Legacy test shim. Production routes accept adminRows explicitly. */
import { registerGafusAdminRowsPort } from "@gafus/core/services/adminGafus";
import { adminRows } from "./admin-rows-instance.js";
registerGafusAdminRowsPort(adminRows);
