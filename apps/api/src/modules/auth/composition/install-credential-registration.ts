/** Credential registration Application composition. Persistence owns SQL
 * uniqueness, one-time registration receipt and transaction for user, consent
 * and current-partner referral. Core only supplies policy and public errors.
 */
import { registerCredentialRegistrationPort } from "@gafus/core/services/auth";
import {
  withRegistrationTransaction,
  readCredentialRegistrationReplayUserTx,
  insertCredentialRegistrationUserTx,
  markCredentialRegistrationAttemptSucceededTx,
  registrationUniqueErrorTargets,
  createCompletedConsentLogsInTransaction,
  attributePartnerReferralIfCurrentPartnerInTransaction,
} from "@gafus/identity-write-server/registration-contract-rows";

const credentialRegistrationPort = {
  withRegistrationTransaction,
  readCredentialRegistrationReplayUserTx,
  insertCredentialRegistrationUserTx,
  markCredentialRegistrationAttemptSucceededTx,
  registrationUniqueErrorTargets,
  createCompletedConsentLogsInTransaction,
  attributePartnerReferralIfCurrentPartnerInTransaction,
};
registerCredentialRegistrationPort(credentialRegistrationPort);
