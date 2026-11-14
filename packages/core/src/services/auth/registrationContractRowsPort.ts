/** Server registration SQL contract. Opaque Tx is valid only inside the existing
 * callback; Core cannot create a Prisma connection, change a lock scope, or
 * exchange a grant without server-side row checks. No server package imports.
 */
export type RegistrationContractDbTx = unknown;
export type RegistrationContractChannel = "WEB" | "IOS" | "ANDROID" | "UNKNOWN";
export type RegistrationContractVkPurpose = "REGISTER" | "LOGIN" | "LINK_ACCOUNT";
export type RegistrationContractLoginPurpose = "LOGIN" | "REGISTRATION_CONSENT";
export type RegistrationPromoDbRow = {
  id: string; code: string; normalizedCode: string; discountPercent: number; revision: number;
};
export type RegistrationPromoStatus = RegistrationPromoDbRow & { isActive: boolean; archivedAt: Date | null };
export type RegistrationEmailAttemptRow = {
  id: string; userId: string | null; tempSessionId: string; dataFingerprint: string;
  completedAt: Date | null;
  result: "SUCCEEDED" | "USERNAME_TAKEN" | "EMAIL_TAKEN" | "VALIDATION_ERROR" | null;
};
export type RegistrationVkLoginGrantRow = {
  id: string; userId: string; purpose: RegistrationContractLoginPurpose; registrationContextId: string | null;
};
export interface RegistrationContractRowsPort {
  withRegistrationTransaction<T>(
    action: (tx: RegistrationContractDbTx) => Promise<T>,
    options?: {maxWait?: number; timeout?: number},
  ): Promise<T>;
  readRegistrationPromoRowTx(tx: RegistrationContractDbTx, normalizedCode: string): Promise<RegistrationPromoStatus | null>;
  saveRegistrationPromoRowTx(tx: RegistrationContractDbTx, userId: string, promoId: string): Promise<unknown>;
  lockRegistrationEmailAttemptTx(tx: RegistrationContractDbTx, tempSessionId: string): Promise<void>;
  readRegistrationEmailAttemptTx(tx: RegistrationContractDbTx, tempSessionId: string): Promise<RegistrationEmailAttemptRow | null>;
  insertRegistrationEmailAttemptTx(tx: RegistrationContractDbTx, input: {
    tempSessionId: string; dataFingerprint: string;
  }): Promise<RegistrationEmailAttemptRow>;
  finishRegistrationEmailAttemptTx(tx: RegistrationContractDbTx, id: string, input: {
    result: "SUCCEEDED" | "USERNAME_TAKEN" | "EMAIL_TAKEN" | "VALIDATION_ERROR"; userId?: string;
  }): Promise<RegistrationEmailAttemptRow>;
  insertVkRegistrationContextTx(tx: RegistrationContractDbTx, input: {
    contextTokenHash: string; stateHash: string; codeVerifier: string;
    purpose: RegistrationContractVkPurpose; selectedPromoCodeId?: string | null;
    selectedPromoCodeValue?: string | null; userId?: string | null; expiresAt: Date;
  }): Promise<{id: string}>;
  claimVkRegistrationContextUserTx(tx: RegistrationContractDbTx, input: {
    contextTokenHash: string; stateHash: string; purpose: RegistrationContractVkPurpose; userId: string; now: Date;
  }): Promise<{count: number}>;
  insertVkLoginGrantTx(tx: RegistrationContractDbTx, input: {
    tokenHash: string; userId: string; purpose: RegistrationContractLoginPurpose;
    reissuedFromId?: string; registrationContextId?: string; expiresAt: Date;
  }): Promise<RegistrationVkLoginGrantRow>;
  consumeVkLoginGrantRowTx(tx: RegistrationContractDbTx, input: {
    tokenHash: string; purpose: RegistrationContractLoginPurpose; requireConsent?: boolean; now: Date;
  }): Promise<RegistrationVkLoginGrantRow | null>;
}
let bound: Readonly<RegistrationContractRowsPort> | null = null;
export function registerRegistrationContractRowsPort(port: RegistrationContractRowsPort): void {
  if (bound !== null && bound !== port) throw new Error("REGISTRATION_CONTRACT_ROWS_PORT_ALREADY_BOUND");
  bound = port;
}
export function requireRegistrationContractRowsPort(): Readonly<RegistrationContractRowsPort> {
  if (bound === null) throw new Error("REGISTRATION_CONTRACT_ROWS_PORT_UNBOUND");
  return bound;
}
