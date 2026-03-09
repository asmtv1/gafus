import Constants from "expo-constants";
import { Platform } from "react-native";

const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
const env = typeof process !== "undefined" ? process.env : undefined;

function getStr(key: string, extraKey?: string): string | undefined {
  const fromEnv = env?.[key];
  if (typeof fromEnv === "string") return fromEnv;
  const fromExtra = extraKey ? extra?.[extraKey] : undefined;
  return typeof fromExtra === "string" ? fromExtra : undefined;
}

function getExtra(key: string): string | undefined {
  const v = extra?.[key];
  return typeof v === "string" ? v : undefined;
}

function isEnableFlag(): boolean {
  const fromEnv = env?.EXPO_PUBLIC_ENABLE_TRACER === "true";
  const fromExtra = extra?.enableTracer;
  return !!fromEnv || fromExtra === true || fromExtra === "true";
}

/** Токен по платформе: iOS/Android — свои, иначе fallback. */
function getAppToken(): string | undefined {
  const isIos = Platform.OS === "ios";
  const isAndroid = Platform.OS === "android";
  if (isIos) {
    return getStr("EXPO_PUBLIC_TRACER_APP_TOKEN_IOS", "tracerAppTokenIos") ?? getExtra("tracerAppTokenIos");
  }
  if (isAndroid) {
    return getStr("EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID", "tracerAppTokenAndroid") ?? getExtra("tracerAppTokenAndroid");
  }
  return getStr("EXPO_PUBLIC_TRACER_APP_TOKEN", "tracerAppToken") ?? getExtra("tracerAppToken");
}

/** Tracer включён если есть токен И (production ИЛИ явный флаг) */
export function isTracerEnabled(): boolean {
  const token = getAppToken();
  if (!token) return false;
  return !__DEV__ || isEnableFlag();
}

/** Возвращает конфиг для отправки или null если отключено */
export function getTracerConfig(): { appToken: string; versionName: string } | null {
  if (!isTracerEnabled()) return null;
  const appToken = getAppToken() ?? "";
  if (!appToken) return null;
  const versionName =
    getStr("EXPO_PUBLIC_APP_VERSION", "appVersion") ??
    getExtra("appVersion") ??
    "1.0.0";
  return { appToken, versionName };
}
