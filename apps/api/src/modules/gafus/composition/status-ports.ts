/**
 * Authenticated Gafus wallet STATUS query composition, read-only.
 * SQL projections are on isolated server adapters; Core owns defaults,
 * cutoff/cap calculation and wire DTO. Never pass a client-supplied owner ID.
 */
import type { GafusStatusReadPorts } from "@gafus/core/services/gafus";
import { getGafusSettingsRow } from "@gafus/gafus-server/settings-read";
import { listGrantedGafusActivity } from "@gafus/gafus-server/activity-read";
import { readWalletBalanceRow } from "@gafus/gafus-server/wallet-records";

export const gafusStatusReadPorts: GafusStatusReadPorts = {
  readSettingsRow: getGafusSettingsRow,
  readGrantedActivity: listGrantedGafusActivity,
  readBalance: async (ownerId) => (await readWalletBalanceRow(ownerId))?.balance ?? 0,
};
