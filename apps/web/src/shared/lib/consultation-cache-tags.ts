/** Теги для revalidateTag (консультации кинолога). */
export function consultationUserBookingsTag(userId: string): string {
  return `consultations:user:${userId}:bookings`;
}

export function consultationTrainerBookingsTag(trainerUserId: string): string {
  return `consultations:trainer:${trainerUserId}:bookings`;
}

export const CONSULTATION_CYNOLOGISTS_TAG = "consultations:cynologists";
