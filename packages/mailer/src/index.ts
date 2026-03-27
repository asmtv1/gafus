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
