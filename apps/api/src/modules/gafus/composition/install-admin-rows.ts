/** Preserve PostgreSQL transaction boundaries, advisory locks, audit trail and
 * fraud review CAS. The Core policy receives only a typed transactional port. */
import { registerGafusAdminRowsPort, type GafusAdminRowsPort } from "@gafus/core/services/adminGafus";
import { withGafusAdminRows } from "@gafus/gafus-server/admin-rows";

const adminRows: GafusAdminRowsPort = {
  withTransaction(operation, options) {
    return withGafusAdminRows((rows) => operation(rows as unknown as Parameters<typeof operation>[0]), options);
  },
};
registerGafusAdminRowsPort(adminRows);
