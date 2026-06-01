import { getRewardedCreditsStatus } from "@gafus/core/services/rewardedCredits";

import {
  noStoreJson,
  requireUserId,
  rewardedErrorJson,
  rewardedTargetTypeSchema,
  targetFrom,
  unauthorizedJson,
  webPlatformSchema,
} from "../_utils";

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return unauthorizedJson();
  }

  const url = new URL(request.url);
  const parsed = webPlatformSchema.safeParse(url.searchParams.get("platform"));
  if (!parsed.success) {
    return noStoreJson({ success: false, error: "Некорректная web platform" }, { status: 400 });
  }
  const rawTargetType = url.searchParams.get("targetType");
  const targetType = rawTargetType ? rewardedTargetTypeSchema.safeParse(rawTargetType) : null;
  if (targetType && !targetType.success) {
    return noStoreJson({ success: false, error: "Некорректный targetType" }, { status: 400 });
  }

  try {
    const data = await getRewardedCreditsStatus({
      userId,
      platform: parsed.data,
      target: targetFrom({
        targetType: targetType?.success ? targetType.data : undefined,
        targetId: url.searchParams.get("targetId") ?? undefined,
      }),
    });
    return noStoreJson({ success: true, data });
  } catch (error) {
    return rewardedErrorJson(error);
  }
}
