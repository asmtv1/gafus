/** Chat-specific infrastructure façade; never leaks the Prisma client to HTTP. */
export { listChatOutboxDeadLetters, retryChatOutboxDeadLetter } from "@gafus/prisma";
