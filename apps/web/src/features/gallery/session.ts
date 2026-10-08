/** Memory-only fence shared by all gallery surfaces and requests. */
let epoch = 0;
let identity: string | undefined;
let blocked = false;
const listeners = new Set<() => void>();
const aborters = new Set<() => void>();
export const gallerySession = {
  snapshot: () => epoch,
  blocked: () => blocked,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  registerAbort(abort: () => void) {
    aborters.add(abort);
    return () => {
      aborters.delete(abort);
    };
  },
  current(ticket: number) {
    return ticket === epoch && !blocked;
  },
  setIdentity(next: string | undefined) {
    if (next === identity) return;
    identity = next;
    blocked = false;
    this.advance();
  },
  endIdentity() {
    identity = undefined;
    blocked = true;
    this.advance();
  },
  invalidate(ticket: number) {
    if (!this.current(ticket)) return;
    blocked = true;
    this.advance();
  },
  advance() {
    epoch++;
    aborters.forEach((abort) => abort());
    listeners.forEach((listener) => listener());
  },
};
export function assertGallerySession(ticket: number) {
  if (!gallerySession.current(ticket)) throw new Error("Сессия галереи завершена. Войдите снова.");
}
