/** Pure, client-safe consultation intake rules shared by Web and Mobile. */
export const CONSULT_NAME_MAX = 15;
export const CONSULT_TEXT_MAX = 1000;
export const CONSULT_PROBLEM_MIN = 10;

export function isOwnerOrPetName(input: string): boolean {
  const name = input.trim();
  return name.length >= 2 && name.length <= CONSULT_NAME_MAX;
}
export function isProblemField(input: string): boolean {
  const problem = input.trim();
  return problem.length >= CONSULT_PROBLEM_MIN && problem.length <= CONSULT_TEXT_MAX;
}
export function isSelfHelpField(input: string): boolean {
  const answer = input.trim();
  return answer.length >= 1 && answer.length <= CONSULT_TEXT_MAX;
}

/**
 * Preliminary client validation for enabling the submit button.
 * Server-side core booking schemas remain authoritative.
 */
export function isBookingIntakeValid(input: {
  clientOwnerName: string;
  clientPhone: string;
  petName: string;
  petGender: "MALE" | "FEMALE" | "" | null;
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
    (input.petGender === "MALE" || input.petGender === "FEMALE") &&
    input.petAge.trim().length > 0 &&
    input.petBreed.trim().length > 0 &&
    isProblemField(input.clientProblem) &&
    isSelfHelpField(input.clientSelfHelpAttempt)
  );
}
