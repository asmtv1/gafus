import type { NextRequest } from "next/server";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { recordRewardedAdEvent } from "@gafus/core/services/rewardedCredits";
import { z } from "zod";

import { noStoreJson, readJson, requireUserId, rewardedErrorJson, unauthorizedJson } from "../_utils";

const schema = z.object({
  sessionId: z.string().min(1),
  eventType: z.enum(["LOADED", "SHOWN", "DISMISSED", "FAILED", "REWARDED"]),
  payload: z.unknown().optional(),
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
    await recordRewardedAdEvent({
      userId,
      sessionId: parsed.data.sessionId,
      eventType: parsed.data.eventType,
      payload: parsed.data.payload,
    });
    return noStoreJson({ success: true, data: { recorded: true } });
  } catch (error) {
    return rewardedErrorJson(error);
  }
});
