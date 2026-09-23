import AsyncStorage from "@react-native-async-storage/async-storage";

export const MOBILE_INTRO_STORAGE_KEY = "gafus:mobile-intro:v1";
export const MOBILE_INTRO_SLIDE_COUNT = 6;
export type MobileIntroState = { index: number; finished: boolean };

let current: MobileIntroState | undefined;
let writes: Promise<void> = Promise.resolve();

export function parseMobileIntroState(raw: string | null): MobileIntroState {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (value && typeof value === "object") {
      const { index, finished } = value as Partial<MobileIntroState>;
      return {
        index: typeof index === "number" && Number.isInteger(index)
          ? Math.max(0, Math.min(MOBILE_INTRO_SLIDE_COUNT - 1, index)) : 0,
        finished: finished === true,
      };
    }
  } catch { /* A corrupt record starts at the first slide. */ }
  return { index: 0, finished: false };
}

export async function readMobileIntroState(): Promise<MobileIntroState> {
  if (current) return current;
  const raw = await AsyncStorage.getItem(MOBILE_INTRO_STORAGE_KEY);
  // A pending read must never overwrite a newer user action.
  current ??= parseMobileIntroState(raw);
  return current;
}

export function saveMobileIntroState(next: MobileIntroState): Promise<void> {
  current = { ...next };
  const serialized = JSON.stringify(current);
  const write = writes.then(() => AsyncStorage.setItem(MOBILE_INTRO_STORAGE_KEY, serialized));
  // Keep subsequent writes usable after a storage failure, and keep the session
  // state so a completed intro cannot loop back during this app session.
  writes = write.catch(() => undefined);
  return write;
}
