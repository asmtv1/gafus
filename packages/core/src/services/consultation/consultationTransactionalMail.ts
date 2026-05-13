/**
 * Письма по консультациям: тот же HTML-шаблон, что «Подтвердите email» (логотип, CTA, подпись).
 */
import type { ConsultationEmailType, ConsultationPetGender } from "@gafus/prisma";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import {
  ctaButtonHtml,
  escapeHtml,
  paragraphHtml,
  plainLinkFallbackHtml,
  sendTransactionalEmailWithLayout,
} from "../mail/transactionalEmailLayout";
import { getPublicWebBaseUrl } from "../mail/publicWebBaseUrl";
import { formatConsultationPetGenderRu } from "./consultationIntakeDisplay";
import { formatRuPhoneForDisplay } from "./ruPhone";
import { formatConsultationConfirmSlotMsk } from "./consultationMskFormat";

const SUBJECT_BRAND = " — Гафус";

/** Каталог кинологов / повторная запись (текст + HTML-CTA, как в письмах аккаунта). */
function getWebConsultationsCatalogUrl(): string {
  return `${getPublicWebBaseUrl()}/consultations`;
}

function getWebMyConsultationsUrl(): string {
  return `${getPublicWebBaseUrl()}/consultations/my`;
}

const logger = createWebLogger("consultation-transactional-mail");

function subjectForType(t: ConsultationEmailType): string {
  switch (t) {
    case "TRAINER_CONFIRM_REQUEST":
      return `Новая заявка на консультацию${SUBJECT_BRAND}`;
    case "CLIENT_BOOKING_RECEIVED":
      return `Заявка на консультацию получена${SUBJECT_BRAND}`;
    case "CLIENT_BOOKING_CONFIRMED":
      return `Консультация подтверждена${SUBJECT_BRAND}`;
    case "TRAINER_BOOKING_CONFIRMED":
      return `Вы подтвердили консультацию${SUBJECT_BRAND}`;
    case "CLIENT_BOOKING_CANCELLED_BY_TRAINER":
      return `Консультация отменена${SUBJECT_BRAND}`;
    case "TRAINER_BOOKING_CANCELLED_BY_USER":
      return `Клиент отменил заявку${SUBJECT_BRAND}`;
    case "CLIENT_BOOKING_CANCELLED_BY_SLA":
      return `Консультация не подтверждена вовремя${SUBJECT_BRAND}`;
    case "CLIENT_BOOKING_TELEMOST_FAILED":
      return `Техническая ошибка бронирования${SUBJECT_BRAND}`;
    case "CLIENT_CONSULTATION_REMINDER_30M":
      return `Напоминание: консультация скоро${SUBJECT_BRAND}`;
    case "TRAINER_CONSULTATION_REMINDER_30M":
      return `Напоминание: консультация скоро${SUBJECT_BRAND}`;
    case "CLIENT_CONSULTATION_NO_SHOW":
      return `Консультация не состоялась${SUBJECT_BRAND}`;
    default:
      return `Уведомление о консультации${SUBJECT_BRAND}`;
  }
}

function getTrainerPanelConsultationsUrl(): string {
  const base = (
    process.env.NEXT_PUBLIC_TRAINER_PANEL_URL ||
    process.env.TRAINER_PANEL_URL ||
    "https://trainer.gafus.ru"
  ).replace(/\/$/, "");
  return `${base}/main-panel/consultations`;
}

function cynologistDisplayName(
  u: { username: string; profile: { fullName: string | null } | null } | null,
): string {
  if (!u) return "нашего специалиста";
  const name = u.profile?.fullName?.trim();
  return name && name.length > 0 ? name : u.username;
}

function clientDisplayName(u: { username: string; email: string | null }): string {
  return u.username?.trim() || u.email || "клиент";
}

function slotMskLine(booking: { slot: { startAt: Date; endAt: Date } }): string {
  return formatConsultationConfirmSlotMsk(
    booking.slot.startAt.toISOString(),
    booking.slot.endAt.toISOString(),
  );
}

type BookingForMail = {
  id: string;
  telemostJoinUrl: string | null;
  clientOwnerName: string | null;
  clientPhone: string | null;
  petName: string | null;
  petGender: ConsultationPetGender | null;
  petAge: string | null;
  petBreed: string | null;
  clientProblem: string | null;
  clientSelfHelpAttempt: string | null;
  cancelReason: string | null;
  /** Если была подтверждена — отмена назначенной встречи (другое письмо, чем отклонение заявки). */
  trainerConfirmedAt: Date | null;
  client: { email: string | null; username: string };
  cynologist: {
    user: { email: string | null; username: string; profile: { fullName: string | null } | null } | null;
  };
  slot: { startAt: Date; endAt: Date };
};

function intakeAnketLinesPlain(b: BookingForMail): string[] {
  return [
    `Имя владельца: ${b.clientOwnerName?.trim() || "—"}`,
    `Телефон: ${b.clientPhone ? formatRuPhoneForDisplay(b.clientPhone) : "—"}`,
    `Питомец: ${b.petName?.trim() || "—"}`,
    `Пол: ${formatConsultationPetGenderRu(b.petGender)}`,
    `Возраст: ${b.petAge?.trim() || "—"}`,
    `Порода: ${b.petBreed?.trim() || "—"}`,
    `Проблема:\n${b.clientProblem?.trim() || "—"}`,
    `Как пытались решить сами:\n${b.clientSelfHelpAttempt?.trim() || "—"}`,
  ];
}

function intakeAnketBlockHtml(b: BookingForMail): string {
  const line = (label: string, value: string) =>
    `<p style="margin:0 0 8px 0;color:#333333;"><strong>${escapeHtml(
      label,
    )}</strong> ${escapeHtml(value).replace(/\n/g, "<br/>")}</p>`;
  return [
    line("Владелец", b.clientOwnerName?.trim() || "—"),
    line("Телефон", b.clientPhone ? formatRuPhoneForDisplay(b.clientPhone) : "—"),
    line("Питомец", b.petName?.trim() || "—"),
    line("Пол", formatConsultationPetGenderRu(b.petGender)),
    line("Возраст", b.petAge?.trim() || "—"),
    line("Порода", b.petBreed?.trim() || "—"),
    `<p style="margin:0 0 8px 0;color:#333333;"><strong>Проблема</strong><br/>${escapeHtml(
      b.clientProblem?.trim() || "—",
    ).replace(/\n/g, "<br/>")}</p>`,
    `<p style="margin:0 0 16px 0;color:#333333;"><strong>Как пытались решить</strong><br/>${escapeHtml(
      b.clientSelfHelpAttempt?.trim() || "—",
    ).replace(/\n/g, "<br/>")}</p>`,
  ].join("");
}

/** Краткое содержимое письма кинологу: без телефона и данных питомца (они только в панели). */
function trainerInbriefLinesPlain(b: BookingForMail): string[] {
  const login = b.client.username?.trim() || "—";
  return [
    `Логин в «Гафусе»: ${login}`,
    `Имя владельца: ${b.clientOwnerName?.trim() || "—"}`,
    `Проблема:\n${b.clientProblem?.trim() || "—"}`,
    `Как пытались решить сами:\n${b.clientSelfHelpAttempt?.trim() || "—"}`,
  ];
}

function trainerInbriefBlockHtml(b: BookingForMail): string {
  const line = (label: string, value: string) =>
    `<p style="margin:0 0 8px 0;color:#333333;"><strong>${escapeHtml(
      label,
    )}</strong> ${escapeHtml(value).replace(/\n/g, "<br/>")}</p>`;
  const login = b.client.username?.trim() || "—";
  return [
    line("Логин в «Гафусе»", login),
    line("Имя владельца", b.clientOwnerName?.trim() || "—"),
    `<p style="margin:0 0 8px 0;color:#333333;"><strong>Проблема</strong><br/>${escapeHtml(
      b.clientProblem?.trim() || "—",
    ).replace(/\n/g, "<br/>")}</p>`,
    `<p style="margin:0 0 16px 0;color:#333333;"><strong>Как пытались решить</strong><br/>${escapeHtml(
      b.clientSelfHelpAttempt?.trim() || "—",
    ).replace(/\n/g, "<br/>")}</p>`,
  ].join("");
}

async function loadBookingForLog(logId: string): Promise<BookingForMail> {
  const log = await prisma.consultationEmailLog.findUnique({
    where: { id: logId },
    include: {
      booking: {
        include: {
          client: { select: { email: true, username: true } },
          cynologist: {
            include: {
              user: { select: { email: true, username: true, profile: { select: { fullName: true } } } },
            },
          },
          slot: true,
        },
      },
    },
  });
  if (!log?.booking) {
    throw new Error("booking not found for email log");
  }
  return log.booking as BookingForMail;
}

function recipientForType(b: BookingForMail, type: ConsultationEmailType): string {
  if (
    type === "TRAINER_CONFIRM_REQUEST" ||
    type === "TRAINER_BOOKING_CONFIRMED" ||
    type === "TRAINER_BOOKING_CANCELLED_BY_USER" ||
    type === "TRAINER_CONSULTATION_REMINDER_30M"
  ) {
    return b.cynologist.user?.email ?? "";
  }
  return b.client.email ?? "";
}

function buildPayload(
  type: ConsultationEmailType,
  b: BookingForMail,
): { text: string; blocksHtml: string[] } {
  const cynNamePlain = cynologistDisplayName(b.cynologist.user);
  const cynNameHtml = escapeHtml(cynNamePlain);
  const clientName = clientDisplayName(b.client);
  const clientNameEsc = escapeHtml(clientName);
  const slotLine = slotMskLine(b);
  const slotEsc = escapeHtml(slotLine);

  switch (type) {
    case "CLIENT_BOOKING_RECEIVED": {
      const text = [
        "Здравствуйте!",
        "",
        `Вы оставили заявку на первичную бесплатную онлайн-консультацию у кинолога ${cynNamePlain}.`,
        "",
        `Созвон запланирован на: ${slotLine}.`,
        "",
        "Данные из заявки:",
        ...intakeAnketLinesPlain(b),
        "",
        "Ожидаем, пока наш кинолог подтвердит встречу со своей стороны.",
        "",
        "С уважением,",
        "команда Гафус",
      ].join("\n");

      const blocksHtml: string[] = [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(
          `Вы оставили заявку на первичную бесплатную онлайн-консультацию у кинолога ${cynNameHtml}.`,
        ),
        paragraphHtml(`Созвон запланирован на: ${slotEsc}.`),
        paragraphHtml("Данные из заявки:"),
        intakeAnketBlockHtml(b),
        paragraphHtml("Ожидаем, пока наш кинолог подтвердит встречу со своей стороны."),
      ];
      return { text, blocksHtml };
    }
    case "CLIENT_BOOKING_CONFIRMED": {
      const joinUrl = b.telemostJoinUrl?.trim() ?? "";
      if (!joinUrl) {
        logger.warn("CLIENT_BOOKING_CONFIRMED без ссылки Телемост", { bookingId: b.id });
      }
      const text = [
        "Здравствуйте!",
        "",
        "Кинолог подтвердил вашу консультацию. Встреча пройдёт в сервисе «Яндекс Телемост» (видеовстреча в браузере или в приложении).",
        "",
        `Время: ${slotLine}.`,
        "",
        joinUrl ? `Ссылка на встречу:\n${joinUrl}` : "Ссылка на встречу появится в личном кабинете в разделе «Мои консультации».",
        "",
        "Пожалуйста, заранее проверьте камеру, микрофон и стабильность интернета. Постарайтесь не опаздывать — встреча начинается в запланированное время.",
        "",
        "С уважением,",
        "команда Гафус",
      ].join("\n");

      const blocksHtml: string[] = [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(
          "Кинолог подтвердил вашу консультацию. Консультация пройдёт в «Яндекс Телемосте» (видеовстреча в браузере или в приложении). Ниже — кнопка на комнату встречи.",
        ),
        paragraphHtml(`Время: ${slotEsc}.`),
        paragraphHtml(
          "Пожалуйста, заранее проверьте камеру, микрофон и стабильность соединения. Постарайтесь не опаздывать — встреча рассчитана на запланированное начало по московскому времени.",
        ),
      ];
      if (joinUrl) {
        blocksHtml.push(ctaButtonHtml(joinUrl, "Открыть Телемост"), plainLinkFallbackHtml(joinUrl));
      } else {
        blocksHtml.push(
          paragraphHtml("Ссылка на встречу появится в личном кабинете в разделе «Мои консультации» на сайте «Гафус»."),
        );
      }
      return { text, blocksHtml };
    }
    case "TRAINER_CONFIRM_REQUEST": {
      const panelUrl = getTrainerPanelConsultationsUrl();
      const text = [
        "Здравствуйте!",
        "",
        "У вас новая заявка на онлайн-консультацию в сервисе «Гафус».",
        "",
        `Время слота (московское): ${slotLine}`,
        "",
        "Кратко по заявке (телефон, питомец и остальное — в панели кинолога):",
        ...trainerInbriefLinesPlain(b),
        "",
        "Откройте панель кинолога, чтобы подтвердить или отклонить заявку и увидеть полные данные.",
        "",
        panelUrl,
        "",
        "С уважением,",
        "команда Гафус",
      ].join("\n");
      const blocksHtml: string[] = [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml("У вас новая заявка на онлайн-консультацию в сервисе «Гафус»."),
        paragraphHtml(`Время слота (московское): ${slotEsc}.`),
        paragraphHtml("Кратко по заявке. Телефон, данные питомца и прочее смотрите в панели:"),
        trainerInbriefBlockHtml(b),
        paragraphHtml("Откройте панель, чтобы подтвердить или отклонить заявку и увидеть полные данные."),
        ctaButtonHtml(panelUrl, "Перейти к заявкам"),
        plainLinkFallbackHtml(panelUrl),
      ];
      return { text, blocksHtml };
    }
    case "TRAINER_BOOKING_CONFIRMED": {
      const joinUrl = b.telemostJoinUrl?.trim() ?? "";
      const panelUrl = getTrainerPanelConsultationsUrl();
      const text = [
        "Здравствуйте!",
        "",
        `Вы подтвердили встречу с клиентом ${clientName}.`,
        `Время: ${slotLine}.`,
        "",
        joinUrl ? `Ссылка на Телемост:\n${joinUrl}` : "",
        "",
        "Проверьте заранее оборудование и не опаздывайте — клиент рассчитывает на начало в назначенное время по московскому времени.",
        "",
        panelUrl,
        "",
        "С уважением,",
        "команда Гафус",
      ]
        .filter(Boolean)
        .join("\n");

      const blocksHtml: string[] = [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(
          `Вы подтвердили встречу с клиентом ${clientNameEsc}. Консультация пройдёт в «Яндекс Телемосте».`,
        ),
        paragraphHtml(`Время: ${slotEsc}.`),
      ];
      if (joinUrl) {
        blocksHtml.push(ctaButtonHtml(joinUrl, "Открыть Телемост"), plainLinkFallbackHtml(joinUrl));
      }
      blocksHtml.push(
        paragraphHtml(
          "Пожалуйста, заранее проверьте камеру и микрофон. Постарайтесь не опаздывать — встреча рассчитана на запланированное начало для клиента (по московскому времени).",
        ),
        ctaButtonHtml(panelUrl, "Панель консультаций"),
        plainLinkFallbackHtml(panelUrl),
      );
      return { text, blocksHtml };
    }
    case "CLIENT_BOOKING_CANCELLED_BY_TRAINER": {
      const catalogUrl = getWebConsultationsCatalogUrl();
      const reasonPlain = b.cancelReason?.trim();
      const reasonHtmlBlock = reasonPlain
        ? [
            `<p style="margin:0 0 16px 0;color:#333333;"><strong>Комментарий кинолога:</strong><br/>${escapeHtml(
              reasonPlain,
            ).replace(/\n/g, "<br/>")}</p>`,
          ]
        : [];
      const wasConfirmedMeeting = b.trainerConfirmedAt != null;
      if (wasConfirmedMeeting) {
        const text = [
          "Здравствуйте!",
          "",
          "Приносим извинения за неудобства. К сожалению, кинолог отменил назначенную встречу.",
          `Плановое время: ${slotLine}.`,
          reasonPlain ? `Комментарий кинолога:\n${reasonPlain}` : "",
          "",
          "Когда вам будет удобно, вы можете снова записаться к кинологу на сайте:",
          catalogUrl,
          "",
          "С уважением,",
          "команда Гафус",
        ].join("\n");
        return {
          text,
          blocksHtml: [
            paragraphHtml("Здравствуйте!"),
            paragraphHtml(
              "Приносим извинения за неудобства. К сожалению, кинолог отменил назначенную встречу.",
            ),
            paragraphHtml(`Плановое время: ${slotEsc}.`),
            ...reasonHtmlBlock,
            paragraphHtml(
              "Когда вам будет удобно, вы можете снова выбрать кинолога и удобный слот в сервисе «Гафус» — ссылка ниже.",
            ),
            ctaButtonHtml(catalogUrl, "Консультации на сайте"),
            plainLinkFallbackHtml(catalogUrl),
          ],
        };
      }
      const text = [
        "Здравствуйте!",
        "",
        "К сожалению, кинолог отменил эту заявку на консультацию.",
        `Ранее было выбрано время: ${slotLine}.`,
        reasonPlain ? `Комментарий кинолога:\n${reasonPlain}` : "",
        "",
        "Когда вам будет удобно, вы можете выбрать другого кинолога и другой слот на сайте:",
        catalogUrl,
        "",
        "С уважением,",
        "команда Гафус",
      ].join("\n");
      return {
        text,
        blocksHtml: [
          paragraphHtml("Здравствуйте!"),
          paragraphHtml("К сожалению, кинолог отменил эту заявку на консультацию."),
          paragraphHtml(`Ранее было выбрано время: ${slotEsc}.`),
          ...reasonHtmlBlock,
          paragraphHtml("Когда вам будет удобно, вы можете снова выбрать кинолога и подходящий слот — нажмите кнопку ниже."),
          ctaButtonHtml(catalogUrl, "Консультации на сайте"),
          plainLinkFallbackHtml(catalogUrl),
        ],
      };
    }
    case "TRAINER_BOOKING_CANCELLED_BY_USER": {
      const panelUrl = getTrainerPanelConsultationsUrl();
      const wasConfirmed = b.trainerConfirmedAt != null;
      if (wasConfirmed) {
        const text = [
          "Здравствуйте!",
          "",
          `Клиент ${clientName} отменил подтверждённую встречу.`,
          `Плановое время: ${slotLine}. Слот снова свободен для других клиентов.`,
          "",
          "Откройте панель кинолога:",
          panelUrl,
          "",
          "С уважением,",
          "команда Гафус",
        ].join("\n");
        return {
          text,
          blocksHtml: [
            paragraphHtml("Здравствуйте!"),
            paragraphHtml(
              `Клиент ${clientNameEsc} отменил подтверждённую консультацию. Слот снова доступен для новой записи.`,
            ),
            paragraphHtml(`Плановое время: ${slotEsc}.`),
            paragraphHtml("Перейдите в панель — актуальные заявки и ссылка на Телемост, если оформите новую встречу."),
            ctaButtonHtml(panelUrl, "Перейти к заявкам"),
            plainLinkFallbackHtml(panelUrl),
          ],
        };
      }
      const text = [
        "Здравствуйте!",
        "",
        `Клиент ${clientName} отменил заявку на консультацию до подтверждения с вашей стороны.`,
        `Слот: ${slotLine} (московское время). Слот снова доступен для записи.`,
        "",
        "Открыть раздел заявок в панели кинолога:",
        panelUrl,
        "",
        "С уважением,",
        "команда Гафус",
      ].join("\n");
      return {
        text,
        blocksHtml: [
          paragraphHtml("Здравствуйте!"),
          paragraphHtml(
            `Клиент ${clientNameEsc} отменил заявку на консультацию до подтверждения с вашей стороны. Слот снова свободен для других клиентов.`,
          ),
          paragraphHtml(`Плановое время слота: ${slotEsc}.`),
          paragraphHtml("Перейдите в панель, чтобы видеть актуальные заявки и расписание."),
          ctaButtonHtml(panelUrl, "Перейти к заявкам"),
          plainLinkFallbackHtml(panelUrl),
        ],
      };
    }
    case "CLIENT_BOOKING_CANCELLED_BY_SLA": {
      const catalogUrl = getWebConsultationsCatalogUrl();
      const text = [
        "Здравствуйте!",
        "",
        "К сожалению, кинолог не подтвердил встречу в отведённое время, и бронирование отменилось автоматически.",
        `Выбранный слот: ${slotLine}.`,
        "",
        "Вы можете в любой момент оформить новую заявку на сайте:",
        catalogUrl,
        "",
        "С уважением,",
        "команда Гафус",
      ].join("\n");
      return {
        text,
        blocksHtml: [
          paragraphHtml("Здравствуйте!"),
          paragraphHtml(
            "К сожалению, кинолог не подтвердил встречу в отведённое время, и бронирование отменилось автоматически. Извините за неудобства.",
          ),
          paragraphHtml(`Выбранный слот: ${slotEsc}.`),
          paragraphHtml("Выберите кинолога и время снова — ссылка на раздел консультаций ниже."),
          ctaButtonHtml(catalogUrl, "Консультации на сайте"),
          plainLinkFallbackHtml(catalogUrl),
        ],
      };
    }
    case "CLIENT_BOOKING_TELEMOST_FAILED": {
      const catalogUrl = getWebConsultationsCatalogUrl();
      const text = [
        "Здравствуйте!",
        "",
        "Не получилось создать комнату для видеовстречи (Яндекс Телемост) при бронировании. Запись отменена, слот снова свободен.",
        "Пожалуйста, попробуйте выбрать время и оформить заявку ещё раз.",
        "",
        catalogUrl,
        "",
        "С уважением,",
        "команда Гафус",
      ].join("\n");
      return {
        text,
        blocksHtml: [
          paragraphHtml("Здравствуйте!"),
          paragraphHtml(
            "Не получилось автоматически создать комнату в «Яндекс Телемосте» при записи. Бронь отменена, вы ничего не оплачивали.",
          ),
          paragraphHtml("Попробуйте снова выбрать удобное время и оформить заявку — ссылка на каталог консультаций ниже."),
          ctaButtonHtml(catalogUrl, "Консультации на сайте"),
          plainLinkFallbackHtml(catalogUrl),
        ],
      };
    }
    case "CLIENT_CONSULTATION_REMINDER_30M": {
      const myUrl = getWebMyConsultationsUrl();
      const joinUrl = b.telemostJoinUrl?.trim() ?? "";
      const text = [
        "Здравствуйте!",
        "",
        `Напоминание: ваша консультация с кинологом ${cynNamePlain} начнётся примерно в течение 30 минут (время: ${slotLine}).`,
        "",
        "Проверьте заранее камеру, микрофон и интернет. Постарайтесь открыть ссылку на Телемост за несколько минут до начала.",
        joinUrl ? `Ссылка: ${joinUrl}` : "Ссылка в разделе «Мои консультации».",
        myUrl,
        "",
        "С уважением,",
        "команда Гафус",
      ]
        .filter(Boolean)
        .join("\n");
      const blocks: string[] = [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(
          `Напоминание: консультация с кинологом ${cynNameHtml} скоро начнётся. Время: ${slotEsc}.`,
        ),
        paragraphHtml(
          "Проверьте камеру, микрофон и стабильность связи. Зайдите в Телемост за пару минут до начала.",
        ),
      ];
      if (joinUrl) {
        blocks.push(
          ctaButtonHtml(joinUrl, "Открыть Телемост"),
          plainLinkFallbackHtml(joinUrl),
        );
      } else {
        blocks.push(paragraphHtml("Ссылка на встречу в разделе «Мои консультации» на сайте."));
      }
      blocks.push(
        ctaButtonHtml(myUrl, "Мои консультации"),
        plainLinkFallbackHtml(myUrl),
      );
      return { text, blocksHtml: blocks };
    }
    case "TRAINER_CONSULTATION_REMINDER_30M": {
      const panelUrl = getTrainerPanelConsultationsUrl();
      const joinUrl = b.telemostJoinUrl?.trim() ?? "";
      const text = [
        "Здравствуйте!",
        "",
        `Напоминание: консультация с клиентом ${clientName} — примерно в течение 30 минут (${slotLine}).`,
        joinUrl ? `Телемост: ${joinUrl}` : "Ссылка в панели кинолога.",
        panelUrl,
        "",
        "С уважением,",
        "команда Гафус",
      ]
        .filter(Boolean)
        .join("\n");
      const blocks: string[] = [
        paragraphHtml("Здравствуйте!"),
        paragraphHtml(
          `Напоминание: встреча с клиентом ${clientNameEsc}. Время: ${slotEsc}.`,
        ),
        paragraphHtml("Проверьте оборудование и зайдите в комнату заранее."),
      ];
      if (joinUrl) {
        blocks.push(ctaButtonHtml(joinUrl, "Открыть Телемост"), plainLinkFallbackHtml(joinUrl));
      }
      blocks.push(
        ctaButtonHtml(panelUrl, "Панель заявок"),
        plainLinkFallbackHtml(panelUrl),
      );
      return { text, blocksHtml: blocks };
    }
    case "CLIENT_CONSULTATION_NO_SHOW": {
      const catalogUrl = getWebConsultationsCatalogUrl();
      const text = [
        "Здравствуйте!",
        "",
        "Ваша встреча почему-то не состоялась.",
        `Плановое время: ${slotLine}.`,
        "",
        "Вы всегда можете выбрать и забронировать новое удобное время в приложении/на сайте.",
        catalogUrl,
        "",
        "С уважением,",
        "команда Гафус",
      ].join("\n");
      return {
        text,
        blocksHtml: [
          paragraphHtml("Здравствуйте!"),
          paragraphHtml("Ваша встреча почему-то не состоялась."),
          paragraphHtml(`Плановое время: ${slotEsc}.`),
          paragraphHtml(
            "Вы всегда можете выбрать и забронировать новое удобное время в приложении/на сайте.",
          ),
          ctaButtonHtml(catalogUrl, "Выбрать время"),
          plainLinkFallbackHtml(catalogUrl),
        ],
      };
    }
  }
}

/**
 * Собрать и отправить письмо по логу (текст + HTML, общий макет с письмами аккаунта).
 */
export async function sendConsultationEmailFromLog(
  emailLogId: string,
  type: ConsultationEmailType,
): Promise<void> {
  const b = await loadBookingForLog(emailLogId);
  const to = recipientForType(b, type);
  if (!to) {
    throw new Error("Получатель без email");
  }
  let subject = subjectForType(type);
  if (type === "CLIENT_BOOKING_CANCELLED_BY_TRAINER" && b.trainerConfirmedAt != null) {
    subject = `Встреча отменена кинологом${SUBJECT_BRAND}`;
  } else if (type === "TRAINER_BOOKING_CANCELLED_BY_USER" && b.trainerConfirmedAt != null) {
    subject = `Клиент отменил встречу${SUBJECT_BRAND}`;
  }
  const { text, blocksHtml } = buildPayload(type, b);

  try {
    await sendTransactionalEmailWithLayout({ to, subject, text, blocksHtml });
  } catch (e) {
    logger.error(
      "Ошибка отправки письма по консультации",
      e instanceof Error ? e : new Error(String(e)),
      { emailLogId, type, bookingId: b.id },
    );
    throw e;
  }
}
