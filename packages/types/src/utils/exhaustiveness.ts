/**
 * Exhaustiveness check для discriminated unions.
 * Вызывает compile-time ошибку, если в switch не обработан какой-то case.
 *
 * @example
 * switch (status) {
 *   case "A": return ...;
 *   case "B": return ...;
 *   default: return assertNever(status);
 * }
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
