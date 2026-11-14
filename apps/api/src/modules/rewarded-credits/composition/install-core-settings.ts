/** API process composition: one authoritative rewarded-ads settings row.
 * No client can supply a custom reader, permission or test-mode override.
 * Import before route activation in app.ts; Core fails closed if not installed.
 */
import { registerRewardedSettingsPort } from "@gafus/core/services/rewardedCredits";
import {
  readRewardedAdSettingsRow,
  writeRewardedAdSettingsRow,
} from "@gafus/gafus-server/rewarded-settings";

const rewardedSettingsPort = {
  readRewardedAdSettingsRow,
  writeRewardedAdSettingsRow,
};
registerRewardedSettingsPort(rewardedSettingsPort);
