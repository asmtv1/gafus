import bcrypt from "bcryptjs";

import { Prisma, prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { authRegisterBodySchema } from "../../validation/authRegisterSchema";

const logger = createWebLogger("register-user-credentials");

const BCRYPT_ROUNDS = 12;

export type RegisterCredentialsConflictCode = "USERNAME_TAKEN" | "EMAIL_TAKEN" | "VALIDATION_ERROR";

export type RegisterUserWithCredentialsResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      code: RegisterCredentialsConflictCode;
      messageRu: string;
    };

export type RegisterUserWithCredentialsInput = {
  username: string;
  email: string;
  password: string;
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

  const existingUsername = await prisma.user.findUnique({
    where: { username: normalizedUsername },
    select: { id: true },
  });
  if (existingUsername) {
    return {
      ok: false,
      code: "USERNAME_TAKEN",
      messageRu: "Имя пользователя уже занято",
    };
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existingEmail) {
    return {
      ok: false,
      code: "EMAIL_TAKEN",
      messageRu: "Email уже зарегистрирован",
    };
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        email: normalizedEmail,
        phone: null,
        password: hashedPassword,
        passwordSetAt: new Date(),
        profile: { create: {} },
      },
      select: { id: true },
    });
    logger.success("Регистрация по email завершена", { userId: user.id });
    return { ok: true, userId: user.id };
  } catch (error: unknown) {
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
