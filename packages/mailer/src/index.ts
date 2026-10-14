export {
  type MailerEnv,
  formatMailFromHeader,
  isMailerConfigured,
  mailerEnvFromProcess,
} from "./env.js";
export {
  type Attachment,
  type SendTransactionalMailInput,
  createMailerTransporter,
  sendTransactionalMail,
} from "./send-transactional-mail.js";
export {
  type NpdReceiptEmailData,
  type RenderedNpdReceiptEmail,
  escapeHtml,
  renderNpdReceiptEmail,
} from "./npd-receipt-email.js";
export { receiveResendWebhook } from "./webhook.js";

export { enqueueTransactionalMail, processDueTransactionalMailOutbox, mailOutboxEnabled } from "./outbox.js";
