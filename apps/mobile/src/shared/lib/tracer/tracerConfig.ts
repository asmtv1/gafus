import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
const env = typeof process !== "undefined" ? process.env : undefined;

function getStr(key: string, extraKey?: string): string | undefined {
  const fromEnv = env?.[key];
  if (typeof fromEnv === "string") return fromEnv;
  const fromExtra = extraKey ? extra?.[extraKey] : undefined;
  return typeof fromExtra === "string" ? fromExtra : undefined;
}

function isEnableFlag(): boolean {
  const fromEnv = env?.EXPO_PUBLIC_ENABLE_TRACER === "true";
  const fromExtra = extra?.enableTracer;
  return !!fromEnv || fromExtra === true || fromExtra === "true";
}

/** Tracer включён если есть токен И (production ИЛИ явный флаг) */
export function isTracerEnabled(): boolean {
  const token =
    getStr("EXPO_PUBLIC_TRACER_APP_TOKEN", "tracerAppToken") ??
    (typeof extra?.tracerAppToken === "string" ? extra.tracerAppToken : undefined);
  if (!token) return false;
  return !__DEV__ || isEnableFlag();
}

/** Возвращает конфиг для отправки или null если отключено */
export function getTracerConfig(): { appToken: string; versionName: string } | null {
  if (!isTracerEnabled()) return null;
  const appToken =
    getStr("EXPO_PUBLIC_TRACER_APP_TOKEN", "tracerAppToken") ??
    (typeof extra?.tracerAppToken === "string" ? extra.tracerAppToken : undefined) ??
    "";
  const versionName =
    getStr("EXPO_PUBLIC_APP_VERSION", "appVersion") ??
    (typeof extra?.appVersion === "string" ? extra.appVersion : undefined) ??
    "1.0.0";
  if (!appToken) return null;
  return { appToken, versionName };
}
