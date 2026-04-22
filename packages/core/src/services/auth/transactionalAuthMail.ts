/**
 * Транзакционные письма для сценариев аккаунта (через Postfix / @gafus/mailer).
 *
 * Доставляемость (спам / «нет доверия» у Mail.ru и др.):
 * — Настраивается на стороне DNS и почтового сервера: PTR для IP отправителя, SPF, DKIM,
 *   DMARC для домена в MAIL_FROM. Без этого клиенты режут ссылки и картинки даже при
 *   корректной вёрстке.
 * — Вёрстка: multipart text+html, «bulletproof» CTA (таблица + padding на &lt;a&gt;, VML для
 *   Outlook), логотип по возможности inline (cid), чтобы клиент не ходил за картинкой по URL.
 *
 * См. обзоры: Litmus (bulletproof buttons), Twilio/SendGrid (CID vs linked images).
 * В репозитории .cursor/skills отдельного skill про email нет — ориентиры выше.
 */

import { isMailerConfigured } from "@gafus/mailer";
import { createWebLogger } from "@gafus/logger";

import { getPublicWebBaseUrl } from "../mail/publicWebBaseUrl";
import {
  ctaButtonHtml,
  escapeHtml,
  paragraphHtml,
  plainLinkFallbackHtml,
  sendTransactionalEmailWithLayout as sendTransactionalLayout,
} from "../mail/transactionalEmailLayout";

const logger = createWebLogger("transactional-auth-mail");

export { getPublicWebBaseUrl } from "../mail/publicWebBaseUrl";

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
    "Вы получили это письмо, потому что для аккаунта Гафус запрошено восстановление пароля.",
    "Чтобы задать новый пароль, откройте ссылку в браузере (она действует ограниченное время):",
    resetUrl,
    "",
    "Если вы не запрашивали сброс — ничего не делайте, пароль останется прежним.",
    "",
    "С уважением,",
    "команда Гафус",
  ].join("\n");
  try {
    await sendTransactionalLayout({
      to,
      subject,
      text,
      blocksHtml: [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(
          "Вы получили это письмо, потому что для вашего аккаунта запрошено восстановление пароля.",
        ),
        paragraphHtml(
          "Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действует ограниченное время.",
        ),
        ctaButtonHtml(resetUrl, "Сбросить пароль"),
        paragraphHtml(
          "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо — пароль не изменится.",
        ),
        plainLinkFallbackHtml(resetUrl),
      ],
    });
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
    await sendTransactionalLayout({
      to,
      subject,
      text,
      blocksHtml: [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml("Пароль вашего аккаунта был изменён."),
        paragraphHtml("Если это были не вы — срочно свяжитесь с поддержкой."),
      ],
    });
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
    await sendTransactionalLayout({
      to,
      subject,
      text,
      blocksHtml: [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(`Ваш логин для входа изменён на: ${newUsername}`),
        paragraphHtml("Если это были не вы — свяжитесь с поддержкой."),
      ],
    });
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
  try {
    await sendTransactionalLayout({
      to,
      subject,
      text,
      blocksHtml: [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml("Код для подтверждения удаления аккаунта:"),
        `<p style="margin:16px 0;font-size:24px;font-weight:700;letter-spacing:0.2em;font-family:monospace;">${escapeHtml(
          code,
        )}</p>`,
        paragraphHtml(
          "Код действует 15 минут. Если вы не запрашивали удаление — срочно смените пароль и свяжитесь с поддержкой.",
        ),
      ],
    });
  } catch (error) {
    logger.error(
      "Не удалось отправить код удаления аккаунта",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
    throw new Error("Не удалось отправить письмо. Попробуйте позже.");
  }
}

const WELCOME_EMAIL_RUSTORE_ANDROID_URL =
  "https://www.rustore.ru/catalog/app/ru.gafus.app";
const WELCOME_EMAIL_TELEGRAM_URL = "https://t.me/gafusRu";
/** Витрина РФ в браузере; без региона apps.apple.com/app/… часто отдаёт 404. */
const WELCOME_EMAIL_APP_STORE_IOS_RU_URL =
  "https://apps.apple.com/ru/app/gafus/id6760964612";

function welcomeEmailPlatformUrls(): {
  web: string;
  android: string;
  telegram: string;
  ios: string;
} {
  return {
    web: getPublicWebBaseUrl(),
    android: WELCOME_EMAIL_RUSTORE_ANDROID_URL,
    telegram: WELCOME_EMAIL_TELEGRAM_URL,
    ios:
      process.env.WELCOME_EMAIL_IOS_APP_URL?.trim() || WELCOME_EMAIL_APP_STORE_IOS_RU_URL,
  };
}

/** Список ссылок в приветственном письме (HTML). */
function welcomePlatformsListHtml(urls: ReturnType<typeof welcomeEmailPlatformUrls>): string {
  const iosBlock = `<li style="margin:10px 0;"><strong>iOS (App Store):</strong> <a href="${escapeHtml(
    urls.ios,
  )}" target="_blank" rel="noopener noreferrer" style="color:#1a56db;word-break:break-all;">${escapeHtml(
    urls.ios,
  )}</a></li>`;

  return `<ul style="margin:0 0 16px 0;padding-left:20px;color:#333333;line-height:1.5;">
<li style="margin:10px 0;"><strong>Сайт:</strong> <a href="${escapeHtml(urls.web)}" target="_blank" rel="noopener noreferrer" style="color:#1a56db;word-break:break-all;">${escapeHtml(
    urls.web,
  )}</a></li>
${iosBlock}
<li style="margin:10px 0;"><strong>Android (RuStore):</strong> <a href="${escapeHtml(urls.android)}" target="_blank" rel="noopener noreferrer" style="color:#1a56db;word-break:break-all;">${escapeHtml(
    urls.android,
  )}</a></li>
<li style="margin:10px 0;"><strong>Telegram:</strong> <a href="${escapeHtml(urls.telegram)}" target="_blank" rel="noopener noreferrer" style="color:#1a56db;word-break:break-all;">${escapeHtml(
    urls.telegram,
  )}</a></li>
</ul>`;
}

/**
 * Приветствие после регистрации по email. Не бросает наружу — сбой почты не отменяет регистрацию.
 */
export async function sendWelcomeEmailAfterRegistration(to: string): Promise<void> {
  if (!isMailerConfigured()) return;

  const urls = welcomeEmailPlatformUrls();
  const subject = "Добро пожаловать в Гафус";
  const textIosLine = `iOS (App Store): ${urls.ios}`;
  const text = [
    "Здравствуйте!",
    "",
    "Ваш email был указан при регистрации в сервисе «Гафус». Добро пожаловать!",
    "",
    "Наши платформы:",
    `Сайт: ${urls.web}`,
    textIosLine,
    `Android (RuStore): ${urls.android}`,
    `Telegram: ${urls.telegram}`,
    "",
    "Если вы не регистрировались в Гафус, проигнорируйте это письмо.",
    "",
    "С уважением,",
    "команда Гафус",
  ].join("\n");

  try {
    await sendTransactionalLayout({
      to,
      subject,
      text,
      blocksHtml: [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(
          "Ваш email был указан при регистрации в сервисе «Гафус». Добро пожаловать!",
        ),
        paragraphHtml("Наши платформы:"),
        welcomePlatformsListHtml(urls),
        paragraphHtml(
          "Если вы не регистрировались в Гафус, проигнорируйте это письмо.",
        ),
      ],
    });
  } catch (error) {
    logger.error(
      "Не удалось отправить приветственное письмо после регистрации",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
  }
}

export async function sendEmailChangeConfirmEmail(to: string, confirmUrl: string): Promise<void> {
  assertMailerReady();
  const subject = "Подтвердите новый email — Гафус";
  const text = [
    "Здравствуйте!",
    "",
    "Кто-то указал этот адрес email как новый для аккаунта в сервисе «Гафус».",
    "Чтобы подтвердить смену, откройте ссылку в браузере (она действует ограниченное время):",
    confirmUrl,
    "",
    "Если вы не меняли email в Гафус или не создавали аккаунт — ничего не делайте: адрес не будет привязан.",
    "",
    "С уважением,",
    "команда Гафус",
  ].join("\n");
  try {
    await sendTransactionalLayout({
      to,
      subject,
      text,
      blocksHtml: [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(
          "Вы получили это письмо, потому что для аккаунта «Гафус» запрошена привязка этого email.",
        ),
        paragraphHtml(
          "Нажмите кнопку ниже, чтобы подтвердить новый адрес. Ссылка одноразовая и действует ограниченное время.",
        ),
        ctaButtonHtml(confirmUrl, "Подтвердить email"),
        paragraphHtml(
          "Если вы не запрашивали смену email или это письмо пришло по ошибке — просто удалите его: никаких изменений в аккаунте не произойдёт.",
        ),
        plainLinkFallbackHtml(confirmUrl),
      ],
    });
  } catch (error) {
    logger.error(
      "Не удалось отправить письмо подтверждения email",
      error instanceof Error ? error : new Error(String(error)),
      {},
    );
    throw new Error("Не удалось отправить письмо. Попробуйте позже.");
  }
}
