import { useCallback, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { authApi } from "@/shared/lib/api/auth";
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

export interface UseVkLinkOptions {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

export function useVkLink(options?: UseVkLinkOptions): {
  handleVkLink: () => Promise<void>;
  isVkLinkLoading: boolean;
} {
  const [isVkLinkLoading, setIsVkLinkLoading] = useState(false);

  const handleVkLink = useCallback(async () => {
    setIsVkLinkLoading(true);
    try {
      const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
      const clientId =
        Platform.OS === "ios"
          ? (extra?.vkClientIdIos as string | undefined)
          : (extra?.vkClientIdAndroid as string | undefined);
      if (!clientId) {
        options?.onError?.("VK привязка не настроена");
        return;
      }

      const redirectUri = `vk${clientId}://vk.ru/blank.html`;

      const codeVerifier = await generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = `link_${await generateState()}`;

      const authUrl =
        "https://id.vk.ru/authorize" +
        "?response_type=code" +
        "&client_id=" + encodeURIComponent(clientId) +
        "&redirect_uri=" + encodeURIComponent(redirectUri) +
        "&state=" + encodeURIComponent(state) +
        "&code_challenge=" + encodeURIComponent(codeChallenge) +
        "&code_challenge_method=S256" +
        "&lang_id=0" + // RUS — русский язык для first_name/last_name
        "&display=mobile" +
        "&fastAuthEnabled=1"; // не показывать экран подтверждения повторно

      if (Platform.OS === "android") {
        await WebBrowser.warmUpAsync();
        await WebBrowser.mayInitWithUrlAsync(authUrl);
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri, {
        createTask: false,
      });

      if (Platform.OS === "android") {
        await WebBrowser.coolDownAsync();
      }

      if (result.type !== "success") return;

      if (__DEV__) {
        console.log("[useVkLink] redirect URL (first 200 chars):", result.url.slice(0, 200));
      }

      const parsed = Linking.parse(result.url);
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
        } catch {
          // игнорируем, оставляем из query
        }
      }

      device_id = device_id?.trim();

      if (!code || !device_id || returnedState !== state) {
        options?.onError?.("Ошибка привязки VK: некорректный ответ");
        return;
      }

      const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : undefined;
      const linkResult = await authApi.linkVk({
        code,
        code_verifier: codeVerifier,
        device_id,
        state,
        platform,
      });

      if (linkResult.success) {
        await hapticFeedback.success();
        options?.onSuccess?.();
      } else {
        options?.onError?.(linkResult.error ?? "Ошибка привязки VK");
      }
    } catch (err) {
      if (__DEV__) console.error("[useVkLink] catch", err);
      options?.onError?.("Ошибка подключения к серверу");
    } finally {
      setIsVkLinkLoading(false);
    }
  }, [options]);

  return { handleVkLink, isVkLinkLoading };
}
