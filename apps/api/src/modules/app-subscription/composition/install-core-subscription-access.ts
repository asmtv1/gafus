/** Process composition for the read-only owner/role/period entitlement port.
 * Keep writes/reconciliation in separate provider Application flows.
 */
import { registerSubscriptionAccessPort } from "@gafus/core/services/appSubscription";
import {
  getAppSubscriptionAccess,
  getCynologistEntitlements,
} from "@gafus/subscription-read-server";

const subscriptionAccessPort = {
  getAppSubscriptionAccess,
  getCynologistEntitlements,
};
registerSubscriptionAccessPort(subscriptionAccessPort);
