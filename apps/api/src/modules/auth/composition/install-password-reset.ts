/** API bootstrap: keep password reset receipt SELECT FOR UPDATE, password
 * update and all session revocations in the existing server transaction.
 * Server error identity is translated at this boundary, Core owns the
 * existing public invalid-token and invalid-code errors and postcommit mail.
 */
import { registerPasswordResetPort } from "@gafus/core/services/auth";
import {
  consumePasswordResetReceipt,
  lookupPhoneByNormalizedUsername,
  ResetReceiptUnavailableError,
} from "@gafus/identity-write-server/password-reset";

const passwordResetPort = {
  consumePasswordResetReceipt,
  lookupPhoneByNormalizedUsername,
  isReceiptUnavailableError: (error: unknown) => error instanceof ResetReceiptUnavailableError,
};
registerPasswordResetPort(passwordResetPort);
