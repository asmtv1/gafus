import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { VK_ID_OAUTH_SCOPE } from "@gafus/core/services/auth/vkAuthConstants";

import { useAuthStore } from "@/shared/stores";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

function bytesToBase64Url(arr: Uint8Array): string {
  let binary = "";
  for (const byte of arr) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateCodeVerifier(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return bytesToBase64Url(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateState(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(24);
  return bytesToBase64Url(bytes);
}

export interface UseVkLoginOptions {
  onError?: (message: string) => void;
}

export function useVkLogin(options?: UseVkLoginOptions): {
  handleVkLogin: (promoCode?: string) => Promise<void>;
  isVkLoading: boolean;
} {
  const loginViaVk = useAuthStore((s) => s.loginViaVk);
  const inFlight = useRef(false);
  const [isVkLoading, setIsVkLoading] = useState(false);

  const handleVkLogin = useCallback(async (promoCode?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsVkLoading(true);
    try {
      const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
      const clientId =
        Platform.OS === "ios"
          ? (extra?.vkClientIdIos as string | undefined)
          : (extra?.vkClientIdAndroid as string | undefined);
      if (!clientId) {
        options?.onError?.("VK авторизация не настроена");
        return;
      }

      // VK ID: redirect_uri для authorize — vk{id}://vk.ru/blank.html; Android возвращает vk{id}://vk.ru?payload=...
      const redirectUri = `vk${clientId}://vk.ru/blank.html`;
      // returnUrl для openAuthSessionAsync — vk{id}://vk.ru (без path), иначе vk123://vk.ru?payload=... не проходит startsWith
      const returnUrl = `vk${clientId}://vk.ru`;

      const codeVerifier = await generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = await generateState();

      const authUrl =
        "https://id.vk.ru/authorize" +
        "?response_type=code" +
        "&client_id=" +
        encodeURIComponent(clientId) +
        "&redirect_uri=" +
        encodeURIComponent(redirectUri) +
        "&state=" +
        encodeURIComponent(state) +
        "&code_challenge=" +
        encodeURIComponent(codeChallenge) +
        "&code_challenge_method=S256" +
        "&scope=" +
        encodeURIComponent(VK_ID_OAUTH_SCOPE) +
        "&lang_id=0" + // RUS — русский язык для first_name/last_name
        "&display=mobile" +
        "&fastAuthEnabled=1"; // не показывать экран подтверждения повторно

      if (Platform.OS === "android") {
        await WebBrowser.warmUpAsync();
        await WebBrowser.mayInitWithUrlAsync(authUrl);
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl, {
        createTask: false, // Android: в той же task — лучше redirect, совместимость с эмулятором
      });

      if (Platform.OS === "android") {
        await WebBrowser.coolDownAsync();
      }

      if (__DEV__ && Platform.OS === "android") {
        console.log("[VK_LOGIN] openAuthSessionAsync returned", {
          type: result.type,
          url: "url" in result ? String((result as { url?: string }).url).slice(0, 300) : undefined,
        });
      }

      // Fallback: redirect иногда приходит через Linking после dismiss (Android/iPad)
      let redirectUrl = result.type === "success" ? result.url : undefined;
      if (!redirectUrl && result.type === "dismiss" && Platform.OS !== "web") {
        redirectUrl = await new Promise<string | undefined>((resolve) => {
          const sub = Linking.addEventListener("url", (e) => {
            if (e.url.startsWith(returnUrl)) {
              clearTimeout(timeout);
              sub.remove();
              resolve(e.url);
            }
          });
          const timeout = setTimeout(() => {
            sub.remove();
            resolve(undefined);
          }, 2000);
        });
      }

      if (!redirectUrl) {
        return;
      }

      const parsed = Linking.parse(redirectUrl);
      const q = parsed.queryParams ?? {};


      // VK может возвращать code/device_id/state либо в query, либо в payload (Android)
      let code = q.code as string | undefined;
      let device_id = q.device_id as string | undefined;
      let returnedState = q.state as string | undefined;

      const payloadRaw = q.payload as string | undefined;
      if ((!code || !device_id) && payloadRaw) {
        try {
          const payload = JSON.parse(
            typeof payloadRaw === "string" ? payloadRaw : String(payloadRaw),
          ) as { code?: string; device_id?: string; state?: string };
          code = payload.code ?? code;
          device_id = payload.device_id ?? device_id;
          returnedState = payload.state ?? returnedState;
        } catch (e) {
          reportClientError(e instanceof Error ? e : new Error(String(e)), {
            issueKey: "VkLogin",
            keys: { operation: "parse_vk_redirect_payload" },
          });
          if (__DEV__) console.warn("[VK_LOGIN] payload parse error", e);
        }
      }

      device_id = device_id?.trim();

      if (!code || !device_id || returnedState !== state) {
        options?.onError?.("Ошибка авторизации VK ID: некорректный ответ");
        return;
      }

      const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : undefined;
      const loginResult = await loginViaVk({
        code,
        code_verifier: codeVerifier,
        device_id,
        state,
        platform,
        promoCode: promoCode?.trim() || undefined,
      });

      if (loginResult.success) {
        await hapticFeedback.success();
      } else {
        options?.onError?.(loginResult.error ?? "Ошибка авторизации VK ID");
      }
    } catch (err) {
      reportClientError(err instanceof Error ? err : new Error(String(err)), {
        issueKey: "VkLogin",
        keys: { operation: "vk_login" },
      });
      options?.onError?.("Ошибка подключения к серверу");
    } finally {
      inFlight.current = false;
      setIsVkLoading(false);
    }
  }, [loginViaVk, options]);

  return { handleVkLogin, isVkLoading };
}
