import bcrypt from "bcryptjs";

import { ConsentType, Prisma, prisma, RegistrationChannel } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import {
  authRegisterBodySchema,
  coreRegisterConsentPayloadSchema,
} from "../../validation/authRegisterSchema";
import { attributePartnerReferralIfCurrentPartnerInTransaction } from "../appSubscription/partnerService";
import { createCompletedConsentLogsInTransaction, type CreateConsentLogsParams } from "../consent";
import {
  fingerprintRegistrationAttempt,
  getOrCreateRegistrationEmailAttemptInTransaction,
  RegistrationContractError,
  saveRegistrationPromoCodeInTransaction,
} from "./registrationContracts";
import { parseAppSubscriptionPromoCode } from "../appSubscription/promoCode";

const logger = createWebLogger("register-user-credentials");

const BCRYPT_ROUNDS = 12;

export type RegisterCredentialsConflictCode = "USERNAME_TAKEN" | "EMAIL_TAKEN" | "VALIDATION_ERROR" | "PROMO_INVALID" | "ATTEMPT_MISMATCH";

export type RegisterUserWithCredentialsResult =
  | { ok: true; userId: string; wasCreated: boolean }
  | {
      ok: false;
      code: RegisterCredentialsConflictCode;
      messageRu: string;
      field?: "promoCode";
    };

export type RegisterUserWithCredentialsInput = {
  username: string;
  email: string;
  password: string;
  /** Если не передан — UNKNOWN (старые клиенты / неизвестный канал) */
  registrationChannel?: RegistrationChannel;
  promoCode?: string;
  /** Required for credential registration. Legacy clients remain compatible
   * when they omit promoCode, not when they omit the accepted-consent context. */
  registrationContext?: CreateConsentLogsParams;
};

/**
 * Регистрация по username + email + пароль (без телефона, сразу подтверждённый аккаунт).
 */
export async function registerUserWithCredentials(
  input: RegisterUserWithCredentialsInput,
): Promise<RegisterUserWithCredentialsResult> {
  const parsed = authRegisterBodySchema
    .pick({ name: true, email: true, password: true })
    .safeParse({
      name: input.username,
      email: input.email,
      password: input.password,
    });

  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => e.message).join(", ");
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      messageRu: message || "Некорректные данные регистрации",
    };
  }

  const { name: normalizedUsername, email: normalizedEmail, password } = parsed.data;
  const registrationChannel =
    input.registrationChannel ?? RegistrationChannel.UNKNOWN;
  const registrationContext = input.registrationContext;
  if (!registrationContext) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      messageRu: "Необходимо подтвердить согласия на обработку данных",
    };
  }
  const parsedConsent = coreRegisterConsentPayloadSchema.safeParse(registrationContext.consentPayload);
  if (!parsedConsent.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      messageRu: parsedConsent.error.errors.map((issue) => issue.message).join(", "),
    };
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const parsedPromo = input.promoCode?.trim()
    ? parseAppSubscriptionPromoCode(input.promoCode)
    : null;
  if (input.promoCode?.trim() && !parsedPromo) {
    return { ok: false, code: "PROMO_INVALID", field: "promoCode", messageRu: "Некорректный промокод" };
  }
  const fingerprint = fingerprintRegistrationAttempt({
    username: normalizedUsername,
    email: normalizedEmail,
    registrationChannel,
    promoCode: parsedPromo?.normalizedCode ?? null,
    consent: {
      ...parsedConsent.data,
      versions: Object.fromEntries(Object.values(ConsentType).map((type) => [type, registrationContext.consentVersions?.[type]])),
      defaultVersion: registrationContext.defaultVersion,
    },
  });

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const attempt = await getOrCreateRegistrationEmailAttemptInTransaction(tx, {
        tempSessionId: registrationContext.tempSessionId,
        dataFingerprint: fingerprint,
      });
      if (attempt.completedAt) {
        if (!attempt.userId || attempt.result !== "SUCCEEDED") {
          throw new Error("Completed registration attempt has no successful user");
        }
        const replayUser = await tx.user.findUnique({
          where: { id: attempt.userId },
          select: { id: true, password: true },
        });
        if (!replayUser) throw new Error("Completed registration user is missing");
        return { kind: "replay" as const, user: replayUser };
      }
      const created = await tx.user.create({
        data: {
        username: normalizedUsername,
        email: normalizedEmail,
        phone: null,
        password: hashedPassword,
        passwordSetAt: new Date(),
        registrationChannel,
        profile: { create: {} },
        },
        select: { id: true },
      });
      if (parsedPromo) {
        const promoCode = await saveRegistrationPromoCodeInTransaction(tx, {
          userId: created.id,
          rawCode: parsedPromo.normalizedCode,
        });
        if (promoCode) {
          await attributePartnerReferralIfCurrentPartnerInTransaction(
            tx,
            created.id,
            promoCode.normalizedCode,
          );
        }
      }
      await createCompletedConsentLogsInTransaction(tx, {
        ...registrationContext,
        userId: created.id,
        consentPayload: parsedConsent.data,
        formData: { ...registrationContext.formData, name: normalizedUsername, email: normalizedEmail },
      });
      await tx.registrationEmailAttempt.update({
        where: { id: attempt.id },
        data: { result: "SUCCEEDED", userId: created.id, completedAt: new Date() },
      });
      return { kind: "created" as const, user: { ...created, password: hashedPassword } };
    }, { maxWait: 5000, timeout: 10000 });
    if (outcome.kind === "replay" && !(await bcrypt.compare(password, outcome.user.password))) {
      return { ok: false, code: "ATTEMPT_MISMATCH", messageRu: "Данные регистрации не совпадают с исходной попыткой" };
    }
    logger.success("Регистрация по email завершена", { userId: outcome.user.id });
    return { ok: true, userId: outcome.user.id, wasCreated: outcome.kind === "created" };
  } catch (error: unknown) {
    if (error instanceof RegistrationContractError) {
      if (error.code.startsWith("REGISTRATION_PROMO_")) {
        return { ok: false, code: "PROMO_INVALID", field: "promoCode", messageRu: "Промокод недействителен" };
      }
      if (error.code === "REGISTRATION_ATTEMPT_FINGERPRINT_MISMATCH") {
        return { ok: false, code: "ATTEMPT_MISMATCH", messageRu: "Данные регистрации не совпадают с исходной попыткой" };
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const targets = error.meta?.target as string[] | string | undefined;
      const targetList = Array.isArray(targets) ? targets : targets ? [targets] : [];
      const isEmail = targetList.some((t) => String(t).includes("email"));
      const isUsername = targetList.some((t) => String(t).includes("username"));
      logger.warn("Конфликт уникальности при регистрации", {
        targetList,
        code: error.code,
      });
      if (isEmail) {
        return {
          ok: false,
          code: "EMAIL_TAKEN",
          messageRu: "Email уже зарегистрирован",
        };
      }
      if (isUsername) {
        return {
          ok: false,
          code: "USERNAME_TAKEN",
          messageRu: "Имя пользователя уже занято",
        };
      }
      return {
        ok: false,
        code: "USERNAME_TAKEN",
        messageRu: "Пользователь с такими данными уже существует",
      };
    }
    logger.error(
      "Ошибка создания пользователя",
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}
