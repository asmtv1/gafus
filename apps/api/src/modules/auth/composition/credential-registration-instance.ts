/** Authoritative SQL transaction for credential registration, bound explicitly per call. */
import type { CredentialRegistrationPort } from "@gafus/core/services/auth";
import {
  withRegistrationTransaction,
  readCredentialRegistrationReplayUserTx,
  insertCredentialRegistrationUserTx,
  markCredentialRegistrationAttemptSucceededTx,
  registrationUniqueErrorTargets,
  createCompletedConsentLogsInTransaction,
  attributePartnerReferralIfCurrentPartnerInTransaction,
} from "@gafus/identity-write-server/registration-contract-rows";

export const credentialRegistrationPort = {
  withRegistrationTransaction,
  readCredentialRegistrationReplayUserTx,
  insertCredentialRegistrationUserTx,
  markCredentialRegistrationAttemptSucceededTx,
  registrationUniqueErrorTargets,
  createCompletedConsentLogsInTransaction,
  attributePartnerReferralIfCurrentPartnerInTransaction,
} satisfies CredentialRegistrationPort;
