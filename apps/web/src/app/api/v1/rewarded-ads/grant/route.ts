import type { NextRequest } from "next/server";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { grantRewardedCredits } from "@gafus/core/services/rewardedCredits";
import { z } from "zod";

import { noStoreJson, readJson, requireUserId, rewardedErrorJson, unauthorizedJson } from "../_utils";

const schema = z.object({
  sessionId: z.string().min(1),
  requestNonce: z.string().min(1),
  providerPayload: z.unknown().optional(),
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
    const data = await grantRewardedCredits({
      userId,
      sessionId: parsed.data.sessionId,
      requestNonce: parsed.data.requestNonce,
      providerPayload: parsed.data.providerPayload,
    });
    return noStoreJson({ success: true, data });
  } catch (error) {
    return rewardedErrorJson(error);
  }
});
