/** Process composition for email reset request and change confirmation rows.
 * The existing identity-write-server adapter owns all atomic SQL work:
 * throttle claims, single-use tokens, owner locks, rollback, and retire CAS.
 * Core owns public policy, sanitized errors and mail side-effect ordering.
 */
import { registerEmailAccountRowsPort } from "@gafus/core/services/auth";
import {
  readPasswordResetRequestUser,
  claimPasswordResetEmailToken,
  rollbackFailedPasswordResetEmailToken,
  retireOlderPasswordResetEmailTokens,
  readEmailChangeAccount,
  readEmailOwner,
  stageEmailChange,
  rollbackUndeliveredEmailChange,
  retireOlderEmailChangeTokens,
  consumeEmailChangeConfirmation,
} from "@gafus/identity-write-server/email-account-rows";

const emailAccountRowsPort = {
  readPasswordResetRequestUser,
  claimPasswordResetEmailToken,
  rollbackFailedPasswordResetEmailToken,
  retireOlderPasswordResetEmailTokens,
  readEmailChangeAccount,
  readEmailOwner,
  stageEmailChange,
  rollbackUndeliveredEmailChange,
  retireOlderEmailChangeTokens,
  consumeEmailChangeConfirmation,
};
registerEmailAccountRowsPort(emailAccountRowsPort);
