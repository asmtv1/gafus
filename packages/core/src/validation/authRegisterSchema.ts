export { coreRegisterEmailSchema, isRegisterEmailWithValidDomain, coreRegisterUsernameSchema, coreRegisterPasswordSchema, coreRegisterConsentPayloadSchema, registrationChannelRequestSchema, authRegisterBodySchema } from "@gafus/core-client/validation/auth-register";
export type { AuthRegisterBody } from "@gafus/core-client/validation/auth-register";
import { resolveRegistrationChannelFromBody as resolveClientChannel } from "@gafus/core-client/validation/auth-register";
import type { RegistrationChannel } from "@gafus/prisma";
export function resolveRegistrationChannelFromBody(v: "WEB" | "IOS" | "ANDROID" | undefined): RegistrationChannel { return resolveClientChannel(v) as RegistrationChannel; }
