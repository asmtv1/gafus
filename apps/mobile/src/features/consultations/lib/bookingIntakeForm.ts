/**
 * Паритет с web `consultation-booking-confirm-client.tsx` и `bookSlotInputSchema` в @gafus/core.
 */
export const CONSULT_NAME_MAX = 15;
export const CONSULT_TEXT_MAX = 1000;
export const CONSULT_PROBLEM_MIN = 10;

export const SLOT_TAKEN_MESSAGE =
  "Извините, этот слот уже занят. Выберите другое время.";

export function isOwnerOrPetName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && t.length <= CONSULT_NAME_MAX;
}

export function isProblemField(s: string): boolean {
  const t = s.trim();
  return t.length >= CONSULT_PROBLEM_MIN && t.length <= CONSULT_TEXT_MAX;
}

export function isSelfHelpField(s: string): boolean {
  const t = s.trim();
  return t.length >= 1 && t.length <= CONSULT_TEXT_MAX;
}

/**
 * Все условия отправки, как `canSubmit` на web.
 */
export function isBookingIntakeValid(input: {
  clientOwnerName: string;
  clientPhone: string;
  petName: string;
  petGender: "MALE" | "FEMALE" | null;
  petAge: string;
  petBreed: string;
  clientProblem: string;
  clientSelfHelpAttempt: string;
  phoneOk: (raw: string) => boolean;
}): boolean {
  return (
    isOwnerOrPetName(input.clientOwnerName) &&
    input.phoneOk(input.clientPhone) &&
    isOwnerOrPetName(input.petName) &&
    input.petGender != null &&
    input.petAge.trim().length > 0 &&
    input.petBreed.trim().length > 0 &&
    isProblemField(input.clientProblem) &&
    isSelfHelpField(input.clientSelfHelpAttempt)
  );
}
