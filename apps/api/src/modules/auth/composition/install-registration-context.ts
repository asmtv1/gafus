/** Register exactly one registration-context persistence adapter per API process.
 * The server owns SQL owner/expiry/purpose checks and transaction scope.
 * Core owns hashing, promo policy and public errors. Install before auth routes.
 */
import { registerRegistrationContextPort } from "@gafus/core/services/auth";
import {
  withRegistrationTransaction,
  readIsRegistrationCompleted,
} from "@gafus/identity-write-server/registration-context-reads";

const registrationContextPort = {
  withRegistrationTransaction,
  readIsRegistrationCompleted,
};
registerRegistrationContextPort(registrationContextPort);
