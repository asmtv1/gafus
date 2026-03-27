import { useCallback, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { VK_ID_OAUTH_SCOPE } from "@gafus/core/services/auth/vkAuthConstants";

import { authApi } from "@/shared/lib/api/auth";
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
      const returnUrl = `vk${clientId}://vk.ru`; // без path — Android возвращает vk{id}://vk.ru?payload=...

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
        "&scope=" +
        encodeURIComponent(VK_ID_OAUTH_SCOPE) +
        "&lang_id=0" + // RUS — русский язык для first_name/last_name
        "&display=mobile" +
        "&fastAuthEnabled=1"; // не показывать экран подтверждения повторно

      if (Platform.OS === "android") {
        if (__DEV__) console.log("[VK_LINK] Android start", { clientId, returnUrl });
        await WebBrowser.warmUpAsync();
        await WebBrowser.mayInitWithUrlAsync(authUrl);
      }

      if (__DEV__ && Platform.OS === "android") console.log("[VK_LINK] calling openAuthSessionAsync...");
      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl, {
        createTask: false,
      });

      if (Platform.OS === "android") {
        await WebBrowser.coolDownAsync();
      }

      if (__DEV__ && Platform.OS === "android") {
        console.log("[VK_LINK] openAuthSessionAsync returned", {
          type: result.type,
          url: "url" in result ? String((result as { url?: string }).url).slice(0, 300) : undefined,
        });
      }

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
      if (!redirectUrl) return;

      if (__DEV__) console.log("[VK_LINK] redirect URL:", redirectUrl.slice(0, 300));

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
        } catch (error) {
          reportClientError(error instanceof Error ? error : new Error(String(error)), {
            issueKey: "VkLink",
            keys: { operation: "parse_vk_redirect_payload" },
          });
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
      reportClientError(err instanceof Error ? err : new Error(String(err)), {
        issueKey: "VkLink",
        keys: { operation: "vk_link" },
      });
      if (__DEV__) console.error("[useVkLink] catch", err);
      options?.onError?.("Ошибка подключения к серверу");
    } finally {
      setIsVkLinkLoading(false);
    }
  }, [options]);

  return { handleVkLink, isVkLinkLoading };
}
