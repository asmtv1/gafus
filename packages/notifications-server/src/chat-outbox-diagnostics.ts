/** Chat2 outbox administrative persistence seam.
 * Routes own the ADMIN auth/validation policy, while persistence remains
 * exclusively in the server-side infrastructure package.
 */
import { listChatOutboxDeadLetters, retryChatOutboxDeadLetter } from "@gafus/prisma";

export { listChatOutboxDeadLetters, retryChatOutboxDeadLetter };
