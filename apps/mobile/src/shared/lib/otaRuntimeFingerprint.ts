import * as Updates from "expo-updates";

/**
 * Короткая метка активного JS-бандла: после успешного OTA меняется `updateId`.
 * Канал и runtime — чтобы отловить рассинхрон с `eas update` / нативным билдом.
 * Только мобильный клиент, без запросов к web/API.
 */
export function getOtaRuntimeFingerprintText(): string {
  if (__DEV__) {
    return "клиент: разработка";
  }
  if (!Updates.isEnabled) {
    return "клиент: ota выключен";
  }
  const ch = Updates.channel ?? "—";
  const rv = (Updates.runtimeVersion ?? "—").replace(/\s+/g, "").slice(0, 16);
  const id = Updates.updateId;
  if (id) {
    return `клиент: ${id.slice(0, 8)}… · ${ch} · ${rv}`;
  }
  if (Updates.isEmbeddedLaunch) {
    return `клиент: встроённый · ${ch} · ${rv}`;
  }
  return `клиент: ? · ${ch} · ${rv}`;
}
