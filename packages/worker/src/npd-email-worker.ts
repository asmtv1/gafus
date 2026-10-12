import { renderNpdReceiptEmail, sendTransactionalMail } from "@gafus/mailer";
import { processDueNpdReceiptEmailDeliveriesCore } from "@gafus/core/services/appSubscription";
export type { NpdEmailWorkerResult } from "@gafus/core/services/appSubscription";

/** External SMTP transport only: all claim/retry/state transitions are in core. */
export async function processDueNpdReceiptEmailDeliveries(
  params: Parameters<typeof processDueNpdReceiptEmailDeliveriesCore>[1] = {},
) {
  return processDueNpdReceiptEmailDeliveriesCore(async ({ recipientEmail, receipt }) => {
    const mail = renderNpdReceiptEmail(receipt);
    await sendTransactionalMail({
      to: recipientEmail, subject: mail.subject, text: mail.text, html: mail.html,
    });
  }, params);
}
