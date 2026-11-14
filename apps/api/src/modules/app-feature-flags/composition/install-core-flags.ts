/** Process composition: authoritative feature flags are read and written by
 * feature-flags-server only. Core sees an explicit, fail-closed port.
 * This module is imported before routes are served; never call during a request.
 */
import { registerAppFeatureFlagsPort } from "@gafus/core/services/appFeatureFlags";
import {
  getAppFeatureFlagEnabled,
  getMobileFeatureFlagEnabled,
  getMobileReleaseControl,
  getMobileAppPublicConfig,
  setAppFeatureFlagEnabled,
  updateMobileReleaseControl,
} from "@gafus/feature-flags-server/appFeatureFlagsService";

const featureFlagsPort = {
  getAppFeatureFlagEnabled,
  getMobileFeatureFlagEnabled,
  getMobileReleaseControl,
  getMobileAppPublicConfig,
  setAppFeatureFlagEnabled,
  updateMobileReleaseControl,
};
registerAppFeatureFlagsPort(featureFlagsPort);
