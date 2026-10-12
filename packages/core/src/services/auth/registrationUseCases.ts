import { prisma } from "@gafus/prisma";
import {
  resolveRegistrationPromoCodeInTransaction,
  createVkRegistrationContextInTransaction,
  claimVkRegistrationContextUserInTransaction,
  hashRegistrationOpaqueValue,
} from "./registrationContracts";

/** Centralized registration-channel values; adapters no longer import Prisma enums. */
export const REGISTRATION_CHANNEL = {
  WEB: "WEB",
  IOS: "IOS",
  ANDROID: "ANDROID",
  UNKNOWN: "UNKNOWN",
} as const;

/** Entry points for Web/API: core owns both transactional boundaries and queries. */
export async function previewRegistrationPromoCode(rawCode: unknown) {
  return prisma.$transaction(tx => resolveRegistrationPromoCodeInTransaction(tx, rawCode));
}

export async function createVkRegistrationContextWithPromo(params: {
  contextToken: string;
  state: string;
  codeVerifier: string;
  promoCode?: string | null;
}) {
  return prisma.$transaction(async tx => {
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
  return prisma.vkRegistrationContext.findFirst({
    where: {
      contextTokenHash: hashRegistrationOpaqueValue(contextToken),
      purpose: "REGISTER",
      expiresAt: { gt: new Date() },
      completedAt: null,
    },
    select: { codeVerifier: true },
  });
}

export async function getVkConsentContextSummary(contextToken: string, state: string) {
  return prisma.vkRegistrationContext.findFirst({
    where: {
      contextTokenHash: hashRegistrationOpaqueValue(contextToken),
      stateHash: hashRegistrationOpaqueValue(state),
      purpose: "REGISTER",
      expiresAt: { gt: new Date() },
    },
    select: { selectedPromoCodeValue: true, completedAt: true },
  });
}

export async function getVkPendingRegistrationUsername(contextToken: string, state: string) {
  const context = await prisma.vkRegistrationContext.findFirst({
    where: {
      contextTokenHash: hashRegistrationOpaqueValue(contextToken),
      stateHash: hashRegistrationOpaqueValue(state),
      purpose: "REGISTER",
      expiresAt: { gt: new Date() },
    },
    select: { user: { select: { username: true } } },
  });
  return context?.user?.username ?? null;
}

export async function claimVkRegistrationContextUser(params: {
  contextToken: string; state: string; userId: string;
}) {
  return prisma.$transaction(tx => claimVkRegistrationContextUserInTransaction(tx, {
    ...params, purpose: "REGISTER",
  }));
}

/** Every protected API request validates completion against current DB state. */
export async function isRegistrationCompleted(userId: string): Promise<boolean> {
  const current = await prisma.user.findUnique({
    where: { id: userId }, select: { registrationPending: true },
  });
  return Boolean(current && !current.registrationPending);
}

export async function getVkLinkedAccountUsername(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { username: true },
  });
  return user?.username ?? null;
}
