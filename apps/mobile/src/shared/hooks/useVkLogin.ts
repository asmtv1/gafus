import { useCallback, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { useAuthStore } from "@/shared/stores";
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
  handleVkLogin: () => Promise<void>;
  isVkLoading: boolean;
} {
  const { loginViaVk } = useAuthStore();
  const [isVkLoading, setIsVkLoading] = useState(false);

  const handleVkLogin = useCallback(async () => {
    setIsVkLoading(true);
    try {
      const clientId = Constants.expoConfig?.extra?.vkClientId as string | undefined;
      const redirectUri =
        (Constants.expoConfig?.extra?.vkMobileRedirectUri as string | undefined) ??
        Linking.createURL("auth/vk");

      if (!clientId) {
        options?.onError?.("VK авторизация не настроена");
        return;
      }

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
        options?.onError?.("Ошибка авторизации VK ID: некорректный ответ");
        return;
      }

      const loginResult = await loginViaVk({
        code,
        code_verifier: codeVerifier,
        device_id,
        state,
      });

      if (loginResult.success) {
        await hapticFeedback.success();
      } else {
        options?.onError?.(loginResult.error ?? "Ошибка авторизации VK ID");
      }
    } catch (err) {
      if (__DEV__) console.error("[useVkLogin] catch", err);
      options?.onError?.("Ошибка подключения к серверу");
    } finally {
      setIsVkLoading(false);
    }
  }, [loginViaVk, options]);

  return { handleVkLogin, isVkLoading };
}
