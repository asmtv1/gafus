import { gafusWallet } from "./wallet-instance.js";
/** Operator-only legacy Gafus migration. Core owns confirmation/cutover,
 * frozen batch limits and wallet business rules; SQL is bound here. */
import {
  getLegacyGafusImportPreflight,
  importLegacyRewardedBatch,
  type LegacyGafusImportPorts,
} from "@gafus/core/services/gafus";
import {
  readLegacyImportActorRole,
  readLegacyImportPreflightRows,
  readLegacyImportCandidates,
  runOneLegacyImportTransaction,
} from "@gafus/gafus-server/legacy-import-records";

export const legacyGafusImportPorts: LegacyGafusImportPorts = {
  readActorRole: readLegacyImportActorRole,
  readPreflightRows: readLegacyImportPreflightRows,
  readCandidates: readLegacyImportCandidates,
  runOneTransaction: runOneLegacyImportTransaction as unknown as LegacyGafusImportPorts["runOneTransaction"],
};

export const legacyGafusImportApplication = {
  preflight: (actorId: string) => getLegacyGafusImportPreflight(actorId, legacyGafusImportPorts),
  importBatch: (input: Parameters<typeof importLegacyRewardedBatch>[0]) =>
    importLegacyRewardedBatch(input, legacyGafusImportPorts, gafusWallet.changeGafusBalanceTx),
};
