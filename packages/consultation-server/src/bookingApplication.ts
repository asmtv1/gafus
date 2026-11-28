/** Consultation SQL and queue persistence are in an independent server package. */
import {
  createConsultationBookingService,
  enqueueConsultationEmail,
  resolveConsultationEmailRecipient,
  sendConsultationPush,
} from "@gafus/consultation-write-server/service";
import { getAppSubscriptionAccess, getCynologistEntitlements } from "@gafus/subscription-read-server";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";
import {
  ConsultationBookingRestrictedError,
  ConsultationBookingNotIncludedError,
  ConsultationForbiddenError,
  ConsultationNotFoundError,
  ConsultationSlotTakenError,
  ConsultationIdempotencyKeyConflictError,
} from "@gafus/core/services/consultation/errors";
export const {
  toBookingDto,
  consultationBookingIntentFingerprint,
  bookSlot,
  bookSlotWithSubscription,
  requireConsultationSlotsSubscriptionAccess,
  canBookConsultations,
  requireConsultationBookingSubscriptionAccess,
  confirmBookingByTrainer,
  rejectBookingByTrainer,
  completeBookingByTrainer,
  markBookingNoShowByTrainer,
  cancelBookingByUser,
  processBookingSlaTimeout,
  processConsultationReminder,
  reconcileMissedConsultationReminders,
  reconcileOverdueConsultationBookings,
  listClientBookings,
  listTrainerBookings,
} = createConsultationBookingService({
  enqueueConsultationEmail,
  ConsultationBookingRestrictedError,
  getAppSubscriptionAccess,
  getCynologistEntitlements,
  SubscriptionRequiredError,
  ConsultationBookingNotIncludedError,
  ConsultationForbiddenError,
  ConsultationNotFoundError,
  ConsultationSlotTakenError,
  ConsultationIdempotencyKeyConflictError,
  sendImmediatePushNotification: sendConsultationPush,
});

export { enqueueConsultationEmail, resolveConsultationEmailRecipient };
