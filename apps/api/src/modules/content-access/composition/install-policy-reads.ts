/** Authoritative course/article paid-access reads. SQL owns role, active period,
 * private assignment and exact article Gafus grant; Core decides entitlements.
 * Install before Hono routes. Never trust a client role or course/video id.
 */
import { registerContentPolicyReadPort } from "@gafus/core/services/contentAccess";
import {
  readAccessActorRole,
  hasCurrentPaidSubscription,
  hasAssignedPrivateCourse,
  hasActiveGafusArticleAccess,
} from "@gafus/entitlements-server/policy-reads";

const contentPolicyReads = {
  readAccessActorRole,
  hasCurrentPaidSubscription,
  hasAssignedPrivateCourse,
  hasActiveGafusArticleAccess,
};
registerContentPolicyReadPort(contentPolicyReads);
