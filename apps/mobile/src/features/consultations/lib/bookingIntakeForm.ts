/** Shared client-side consultation validation; keep legacy Mobile imports stable. */
export {
  CONSULT_NAME_MAX,
  CONSULT_TEXT_MAX,
  CONSULT_PROBLEM_MIN,
  isOwnerOrPetName,
  isProblemField,
  isSelfHelpField,
  isBookingIntakeValid,
} from "@gafus/consultation-shared";

export const SLOT_TAKEN_MESSAGE = "Извините, этот слот уже занят. Выберите другое время.";
