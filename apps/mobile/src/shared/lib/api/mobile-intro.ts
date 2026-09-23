import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { apiClient } from "./client";
import { getOrCreateMobileAnalyticsId } from "../analytics-id";

const INTRO_VERSION = "v1";
const STORAGE_KEY = "gafus:mobile-intro:events:v1";
type IntroEvent = "OPENED" | "COMPLETED" | "SKIPPED";
type AuthOutcome = "REGISTERED" | "LOGGED_IN";
type Journal = {
  openedAt: string;
  completion?: IntroEvent;
  events: { event: IntroEvent; occurredAt: string }[];
  auth?: { outcome: AuthOutcome; userId: string; sent: boolean };
};
let updates: Promise<unknown> = Promise.resolve();
let flushing: Promise<void> | null = null;

// Serialize local read-modify-write operations, without holding a lock during HTTP.
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = updates.then(operation);
  updates = result.catch(() => undefined);
  return result;
}
async function readJournal(): Promise<Journal | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Journal;
    if (!value || !Number.isFinite(Date.parse(value.openedAt)) || !Array.isArray(value.events)) return null;
    return value;
  } catch { return null; }
}
async function writeJournal(value: Journal) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export async function trackMobileIntroEvent(event: IntroEvent): Promise<void> {
  await serialized(async () => {
    const now = new Date().toISOString();
    let journal = await readJournal();
    if (!journal) journal = { openedAt: now, events: [{ event: "OPENED", occurredAt: now }] };
    if (event !== "OPENED" && !journal.completion) {
      journal.completion = event;
      journal.events.push({ event, occurredAt: now });
    }
    await writeJournal(journal);
  });
  await flushMobileIntroEvents();
}

export async function trackMobileIntroAuthOutcome(outcome: AuthOutcome, userId: string): Promise<void> {
  await serialized(async () => {
    const journal = await readJournal();
    // Existing users and manual replays must not become first-run conversions.
    if (!journal || journal.auth) return;
    journal.auth = { outcome, userId, sent: false };
    await writeJournal(journal);
  });
  // A flush started before login may only be sending anonymous events.
  if (flushing) await flushing;
  await flushMobileIntroEvents(userId);
}

export function flushMobileIntroEvents(userId?: string): Promise<void> {
  if (flushing) return flushing;
  flushing = flush(userId).finally(() => { flushing = null; });
  return flushing;
}

async function flush(userId?: string): Promise<void> {
  for (;;) {
    const journal = await serialized(readJournal);
    if (!journal) return;
    const next = journal.events[0];
    const auth = !next && journal.auth && !journal.auth.sent && journal.auth.userId === userId
      ? journal.auth : null;
    if (!next && !auth) return;
    const installationId = await getOrCreateMobileAnalyticsId();
    const context = {
      installationId, introVersion: INTRO_VERSION,
      platform: Platform.OS === "ios" ? "IOS" : "ANDROID", openedAt: journal.openedAt,
    };
    const response = next
      ? await apiClient("/api/v1/mobile-intro/events", {
          method: "POST", skipAuth: true, body: { ...context, ...next },
        })
      : await apiClient("/api/v1/mobile-intro/auth-outcome", {
          method: "POST", body: { ...context, outcome: auth!.outcome, userId: auth!.userId },
        });
    // apiClient returns failures as values, not rejected promises.
    if (!response.success) return;
    await serialized(async () => {
      const latest = await readJournal();
      if (!latest) return;
      if (next && latest.events[0]?.event === next.event) latest.events.shift();
      if (auth && latest.auth?.userId === auth.userId) latest.auth.sent = true;
      await writeJournal(latest);
    });
  }
}
