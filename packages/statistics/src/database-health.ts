/** Database diagnostics and lifecycle. Never eager-init Redis providers. */
export {
  checkCoreDatabaseReady,
  disconnectCoreDatabase,
  readDatabasePoolWaitHistograms,
} from "./infra/databaseHealth.js";
