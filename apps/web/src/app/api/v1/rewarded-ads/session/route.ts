import type { NextRequest } from "next/server";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createRewardedAdSession } from "@gafus/core/services/rewardedCredits";
import { z } from "zod";

import {
  noStoreJson,
  readJson,
  requireUserId,
  rewardedErrorJson,
  rewardedTargetTypeSchema,
  targetFrom,
  unauthorizedJson,
  webPlatformSchema,
} from "../_utils";

const schema = z.object({
  platform: webPlatformSchema,
  targetType: rewardedTargetTypeSchema.optional(),
  targetId: z.string().min(1).optional(),
});

export const POST = withCSRFProtection(async (request: NextRequest) => {
  const userId = await requireUserId();
  if (!userId) {
    return unauthorizedJson();
  }
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) {
    return noStoreJson({ success: false, error: "Некорректный запрос" }, { status: 400 });
  }

  try {
    const data = await createRewardedAdSession({
      userId,
      platform: parsed.data.platform,
      target: targetFrom(parsed.data),
    });
    return noStoreJson({ success: true, data });
  } catch (error) {
    return rewardedErrorJson(error);
  }
});
