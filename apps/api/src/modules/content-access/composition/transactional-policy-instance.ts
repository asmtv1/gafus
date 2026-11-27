import { createTransactionalContentPolicy } from "@gafus/core/services/contentAccess";
import { APP_FEATURE_APP_SUBSCRIPTION_GATING, getAppFeatureFlagEnabled } from "@gafus/feature-flags-server";

export const transactionalContentPolicy = createTransactionalContentPolicy(
  () => getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true),
);
