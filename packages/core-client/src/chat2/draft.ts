/** Room-local, ephemeral draft. No shared/global or durable browser storage. */
export function createChat2Draft(initial: string) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set(next: string) {
      if (value === next) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}
export type Chat2Draft = ReturnType<typeof createChat2Draft>;
