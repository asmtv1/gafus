// Экспортируем enum как значение для использования в zod схемах и кастах
export { ConsentLogStatus, ConsentType, ConsultationBookingStatus, ConsultationEmailStatus, ConsultationEmailType, ConsultationPetGender, ConsultationSlotStatus, PetPreventionReminderKind, PetPreventionType, PetType, RegistrationChannel, StepType, SurveyPhase, TrainingStatus, TranscodingStatus, UserRole, AppSubscriptionEventProcessingStatus, AppSubscriptionEventSource, AppSubscriptionPaymentKind, AppSubscriptionPaymentStatus, AppSubscriptionPlanCode, AppSubscriptionPromoCodeEventType, AppSubscriptionProvider, AppSubscriptionStatus, RewardedAdSessionStatus, RewardedCreditTransactionType, RewardedPlatform, RewardedProvider, RewardedTargetAccessSource, RewardedTargetAccessType, RewardedTargetType, RegistrationEmailAttemptResult, VkRegistrationContextPurpose, VkLoginGrantPurpose, } from "@prisma/client";
// Экспортируем пространство имён Prisma (для JsonNull, Decimal и т.д.)
import { Prisma } from "@prisma/client";
export { Prisma };
// Экспортируем готовый экземпляр клиента для приложений
export { prisma, default as prismaClient } from "./client";
export function isPrismaUniqueConstraintError(error) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
//# sourceMappingURL=index.js.map