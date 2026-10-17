/**
 * Reversible technical metadata for correlating authenticated provider webhooks
 * with our local mail attempt. Resend tag values allow ASCII letters, digits,
 * underscores and hyphens (at most 256 chars). Never encode secrets in a delivery key.
 */
export function attemptTagFromId(id: string): string | undefined {
  const tag = Buffer.from(id, "utf8").toString("base64url");
  return tag.length > 0 && tag.length <= 256 ? tag : undefined;
}

export function attemptIdFromTag(tag: unknown): string | undefined {
  if (typeof tag !== "string" || !/^[a-zA-Z0-9_-]{1,256}$/.test(tag)) return undefined;
  const id = Buffer.from(tag, "base64url").toString("utf8");
  return id && attemptTagFromId(id) === tag ? id : undefined;
}
