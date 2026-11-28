/** Authoritative course/article paid-access reads. SQL owns role, active period,
 * private assignment and exact article Gafus grant; Core decides entitlements.
 * Install before Hono routes. Never trust a client role or course/video id.
 */
import { createContentPolicy } from "@gafus/core/services/contentAccess";
import {
  readAccessActorRole,
  hasCurrentPaidSubscription,
  hasAssignedPrivateCourse,
  hasActiveGafusArticleAccess,
} from "@gafus/entitlements-server/policy-reads";

import { getAppFeatureFlagEnabled } from "@gafus/feature-flags-server";
import { APP_FEATURE_APP_SUBSCRIPTION_GATING } from "@gafus/core/services/appFeatureFlags";

const contentPolicyReads = {
  readAccessActorRole,
  hasCurrentPaidSubscription,
  hasAssignedPrivateCourse,
  hasActiveGafusArticleAccess,
};
export const { resolveCourseEntitlement, resolveArticleEntitlement, allowedCourseIds } =
  createContentPolicy(contentPolicyReads, () => getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true));
