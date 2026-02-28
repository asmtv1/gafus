/**
 * Ленивый getter userId для stepStorage.
 * Регистрируется в authStore при инициализации.
 * Устраняет require cycle: authStore → resetAll → stepStore → stepStorage → authStore.
 */
let getUserIdFn: (() => string | undefined) | null = null;

export function setGetUserId(fn: () => string | undefined): void {
  getUserIdFn = fn;
}

export function getUserId(): string {
  return getUserIdFn?.() ?? "anonymous";
}
