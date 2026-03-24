import * as Crypto from "expo-crypto";

let sessionUuid: string | null = null;

/** Идентификатор сессии — in-memory singleton, генерируется один раз. */
export function getSessionUuid(): string {
  if (!sessionUuid) {
    sessionUuid = Crypto.randomUUID();
  }
  return sessionUuid;
}
