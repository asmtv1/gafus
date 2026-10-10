import { createHash } from "node:crypto";
import type { GafusRewardInput, GafusTx } from "./types";

export function normalizeRewardContent(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/\d+/gu, "#")
    .replace(/[^\p{L}\p{N}\s#]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function fingerprintRewardContent(value: string): string {
  return createHash("sha256").update(normalizeRewardContent(value)).digest("hex");
}

function meaningfulLength(value: string): number {
  return [...normalizeRewardContent(value).replace(/\s/g, "")].length;
}

export async function evaluateRewardEligibilityTx(
  tx: GafusTx,
  input: GafusRewardInput,
): Promise<{ eligible: boolean; fingerprint: string | null; code?: string }> {
  let eligible = false;
  const rawText = input.kind === "QUESTION_CREATED"
    ? `${input.title ?? ""}\n${input.body ?? ""}`
    : input.body ?? input.content ?? "";

  switch (input.kind) {
    case "POST_PUBLISHED":
      eligible = meaningfulLength(rawText) >= 20 || Boolean(input.hasPublishedMedia);
      break;
    case "QUESTION_CREATED":
      eligible = meaningfulLength(input.title ?? "") >= 10
        && meaningfulLength(input.body ?? "") >= 30;
      break;
    case "ANSWER_CREATED":
      eligible = meaningfulLength(rawText) >= 20;
      break;
    default:
      eligible = true;
  }
  if (!eligible) return { eligible: false, fingerprint: null, code: "CONTENT_TOO_SHORT" };

  const normalized = normalizeRewardContent(rawText);
  if (!normalized) return { eligible: true, fingerprint: null };
  const fingerprint = createHash("sha256").update(normalized).digest("hex");
  const since = new Date(input.occurredAt.getTime() - 7 * 24 * 60 * 60 * 1000);
  const duplicate = await tx.gafusRewardEvent.findFirst({
    where: {
      userId: input.userId,
      rewardClass: "ACTIVITY",
      contentFingerprint: fingerprint,
      occurredAt: { gte: since, lte: input.occurredAt },
    },
    select: { id: true },
  });
  if (duplicate) return { eligible: false, fingerprint, code: "DUPLICATE_CONTENT" };
  return { eligible: true, fingerprint };
}
