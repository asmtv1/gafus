export type YookassaCredentialProfile = "default" | "mobile_ios" | "mobile_android";

export function getYookassaCredentialProfileForPlatform(
  platform: "ios" | "android",
): Exclude<YookassaCredentialProfile, "default"> {
  return platform === "ios" ? "mobile_ios" : "mobile_android";
}

export function getYookassaCredentialsForProfile(
  profile: YookassaCredentialProfile | string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { shopId: string; secretKey: string } | null {
  const normalizedProfile = profile?.trim() || "default";
  const shopId =
    normalizedProfile === "mobile_ios"
      ? env.YOOKASSA_MOBILE_SDK_SHOP_ID_IOS?.trim()
      : normalizedProfile === "mobile_android"
        ? env.YOOKASSA_MOBILE_SDK_SHOP_ID_ANDROID?.trim()
        : env.YOOKASSA_SHOP_ID?.trim();
  const secretKey =
    normalizedProfile === "mobile_ios"
      ? env.YOOKASSA_MOBILE_API_SECRET_KEY_IOS?.trim()
      : normalizedProfile === "mobile_android"
        ? env.YOOKASSA_MOBILE_API_SECRET_KEY_ANDROID?.trim()
        : env.YOOKASSA_SECRET_KEY?.trim();

  return shopId && secretKey ? { shopId, secretKey } : null;
}
