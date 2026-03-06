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
      const clientId = Constants.expoConfig?.extra?.vkClientId as string | undefined;
      const redirectUri =
        (Constants.expoConfig?.extra?.vkMobileRedirectUri as string | undefined) ??
        Linking.createURL("auth/vk");

      if (!clientId) {
        options?.onError?.("VK привязка не настроена");
        return;
      }

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
        "&display=mobile";

      if (Platform.OS === "android") {
        await WebBrowser.warmUpAsync();
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (Platform.OS === "android") {
        await WebBrowser.coolDownAsync();
      }

      if (result.type !== "success") return;

      const parsed = Linking.parse(result.url);
      const code = parsed.queryParams?.code as string | undefined;
      const device_id = parsed.queryParams?.device_id as string | undefined;
      const returnedState = parsed.queryParams?.state as string | undefined;

      if (!code || !device_id || returnedState !== state) {
        options?.onError?.("Ошибка привязки VK: некорректный ответ");
        return;
      }

      const linkResult = await authApi.linkVk({
        code,
        code_verifier: codeVerifier,
        device_id,
        state,
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
