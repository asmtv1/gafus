/**
 * Транзакционные письма для сценариев аккаунта (через Postfix / @gafus/mailer).
 */

import { isMailerConfigured, sendTransactionalMail } from "@gafus/mailer";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("transactional-auth-mail");

/** Публичный URL сайта (ссылки в письмах). */
export function getPublicWebBaseUrl(): string {
  const raw = process.env.WEB_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://gafus.ru";
  return raw.replace(/\/$/, "");
}

export function assertMailerReady(): void {
  if (!isMailerConfigured()) {
    throw new Error("Отправка писем не настроена (SMTP). Обратитесь в поддержку.");
  }
}

export async function sendPasswordResetLinkEmail(to: string, resetUrl: string): Promise<void> {
  assertMailerReady();
  const subject = "Восстановление пароля — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    `Чтобы задать новый пароль, перейдите по ссылке (действует ограниченное время):`,
    resetUrl,
    "",
    "Если вы не запрашивали сброс, просто проигнорируйте это письмо.",
    "",
    "— Команда Гафус",
  ].join("\n");
  const html = `<p>Здравствуйте!</p><p>Чтобы задать новый пароль, нажмите:</p><p><a href="${escapeHtml(
    resetUrl,
  )}">Сбросить пароль</a></p><p>Если вы не запрашивали сброс, проигнорируйте письмо.</p>`;
  try {
    await sendTransactionalMail({ to, subject, text, html });
  } catch (error) {
    logger.error(
      "Не удалось отправить письмо сброса пароля",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
    throw new Error("Не удалось отправить письмо. Попробуйте позже.");
  }
}

export async function sendPasswordChangedNoticeEmail(to: string): Promise<void> {
  if (!isMailerConfigured()) return;
  const subject = "Пароль изменён — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    "Пароль вашего аккаунта был изменён.",
    "Если это были не вы — срочно свяжитесь с поддержкой.",
    "",
    "— Команда Гафус",
  ].join("\n");
  try {
    await sendTransactionalMail({ to, subject, text });
  } catch (error) {
    logger.error(
      "Не удалось отправить уведомление о смене пароля",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
  }
}

export async function sendUsernameChangedNoticeEmail(to: string, newUsername: string): Promise<void> {
  if (!isMailerConfigured()) return;
  const subject = "Логин изменён — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    `Ваш логин для входа изменён на: ${newUsername}`,
    "Если это были не вы — свяжитесь с поддержкой.",
    "",
    "— Команда Гафус",
  ].join("\n");
  try {
    await sendTransactionalMail({ to, subject, text });
  } catch (error) {
    logger.error(
      "Не удалось отправить уведомление о смене логина",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
  }
}

export async function sendAccountDeletionCodeEmail(to: string, code: string): Promise<void> {
  assertMailerReady();
  const subject = "Код подтверждения удаления аккаунта — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    `Код для подтверждения удаления аккаунта: ${code}`,
    "Код действует 15 минут. Если вы не запрашивали удаление — срочно смените пароль и свяжитесь с поддержкой.",
    "",
    "— Команда Гафус",
  ].join("\n");
  const html = `<p>Здравствуйте!</p><p>Код для подтверждения удаления аккаунта:</p><p style="font-size:1.5rem;font-weight:700;letter-spacing:0.2em;">${escapeHtml(
    code,
  )}</p><p>Код действует 15 минут. Если вы не запрашивали удаление — смените пароль и свяжитесь с поддержкой.</p>`;
  try {
    await sendTransactionalMail({ to, subject, text, html });
  } catch (error) {
    logger.error(
      "Не удалось отправить код удаления аккаунта",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
    throw new Error("Не удалось отправить письмо. Попробуйте позже.");
  }
}

export async function sendEmailChangeConfirmEmail(to: string, confirmUrl: string): Promise<void> {
  assertMailerReady();
  const subject = "Подтвердите новый email — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    "Подтвердите смену email для аккаунта Гафус:",
    confirmUrl,
    "",
    "Если вы не запрашивали смену — проигнорируйте письмо.",
    "",
    "— Команда Гафус",
  ].join("\n");
  const html = `<p>Здравствуйте!</p><p>Подтвердите новый email:</p><p><a href="${escapeHtml(
    confirmUrl,
  )}">Подтвердить</a></p>`;
  try {
    await sendTransactionalMail({ to, subject, text, html });
  } catch (error) {
    logger.error(
      "Не удалось отправить письмо подтверждения email",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
    throw new Error("Не удалось отправить письмо. Попробуйте позже.");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
