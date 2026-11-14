import {
  resolveRegistrationPromoCodeInTransaction,
  createVkRegistrationContextInTransaction,
  claimVkRegistrationContextUserInTransaction,
  hashRegistrationOpaqueValue,
} from "./registrationContracts";

/** One transactional registration-context Persistence port. The SQL adapter
 * keeps the original owner-scoped predicates and the same transaction for
 * promo selection + VK context insert/claim. Core owns opaque-token hashing,
 * public result formats and the REGISTER-only purpose.
 * Missing binding MUST deny registration or protected requests, never return
 * completion=true or authorize a VK context without a database observation.
 */
type RegistrationTx = Parameters<typeof resolveRegistrationPromoCodeInTransaction>[0];
export interface RegistrationContextPorts {
  withRegistrationTransaction<T>(action: (tx: RegistrationTx) => Promise<T>): Promise<T>;
  readValidVkRegistrationContext(tokenHash: string): Promise<{ codeVerifier: string } | null>;
  readVkRegistrationConsentContext(
    tokenHash: string, stateHash: string,
  ): Promise<{ selectedPromoCodeValue: string | null; completedAt: Date | null } | null>;
  readVkRegistrationPendingUsername(tokenHash: string, stateHash: string): Promise<string | null>;
  readIsRegistrationCompleted(userId: string): Promise<boolean>;
  readVkLinkedAccountUsername(userId: string): Promise<string | null>;
}
let installedRegistrationContextPort: Readonly<RegistrationContextPorts> | null = null;
export function registerRegistrationContextPort(port: RegistrationContextPorts): void {
  if (installedRegistrationContextPort !== null && installedRegistrationContextPort !== port) {
    throw new Error("REGISTRATION_CONTEXT_PORT_ALREADY_BOUND");
  }
  installedRegistrationContextPort = port;
}
function requireRegistrationContextPort(): Readonly<RegistrationContextPorts> {
  if (!installedRegistrationContextPort) throw new Error("REGISTRATION_CONTEXT_PORT_UNBOUND");
  return installedRegistrationContextPort;
}

/** Centralized registration-channel values; adapters no longer import Prisma enums. */
export const REGISTRATION_CHANNEL = {
  WEB: "WEB",
  IOS: "IOS",
  ANDROID: "ANDROID",
  UNKNOWN: "UNKNOWN",
} as const;

/** Entry points for Web/API: core owns both transactional boundaries and queries. */
export async function previewRegistrationPromoCode(rawCode: unknown) {
  return requireRegistrationContextPort().withRegistrationTransaction(tx => resolveRegistrationPromoCodeInTransaction(tx, rawCode));
}

export async function createVkRegistrationContextWithPromo(params: {
  contextToken: string;
  state: string;
  codeVerifier: string;
  promoCode?: string | null;
}) {
  return requireRegistrationContextPort().withRegistrationTransaction(async tx => {
    const selected = params.promoCode?.trim()
      ? await resolveRegistrationPromoCodeInTransaction(tx, params.promoCode)
      : null;
    await createVkRegistrationContextInTransaction(tx, {
      contextToken: params.contextToken, state: params.state,
      codeVerifier: params.codeVerifier, purpose: "REGISTER",
      selectedPromoCodeId: selected?.id,
      selectedPromoCodeValue: selected?.normalizedCode,
    });
    return { selectedPromoCode: selected?.normalizedCode ?? null };
  });
}

export async function getValidVkRegistrationContext(contextToken: string) {
  return requireRegistrationContextPort().readValidVkRegistrationContext(hashRegistrationOpaqueValue(contextToken));
}

export async function getVkConsentContextSummary(contextToken: string, state: string) {
  return requireRegistrationContextPort().readVkRegistrationConsentContext(
    hashRegistrationOpaqueValue(contextToken),hashRegistrationOpaqueValue(state));
}

export async function getVkPendingRegistrationUsername(contextToken: string, state: string) {
  return requireRegistrationContextPort().readVkRegistrationPendingUsername(
    hashRegistrationOpaqueValue(contextToken),hashRegistrationOpaqueValue(state));
}

export async function claimVkRegistrationContextUser(params: {
  contextToken: string; state: string; userId: string;
}) {
  return requireRegistrationContextPort().withRegistrationTransaction(tx => claimVkRegistrationContextUserInTransaction(tx, {
    ...params, purpose: "REGISTER",
  }));
}

/** Every protected API request validates completion against current DB state. */
export async function isRegistrationCompleted(userId: string): Promise<boolean> {
  return requireRegistrationContextPort().readIsRegistrationCompleted(userId);
}

export async function getVkLinkedAccountUsername(userId: string): Promise<string | null> {
  return requireRegistrationContextPort().readVkLinkedAccountUsername(userId);
}
