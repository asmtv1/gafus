/** WEB2 provider-aware pet media deletion: no Gallery/Feed provider is ever selected.
 * The database adapter must enqueue inside the same SQL transaction as its
 * corresponding DB mutation and only claim committed rows. No provider IO is
 * allowed before SQL commit. The in-process contract is deliberately separate
 * from any production migration / cloud-worker activation.
 */
import { createHash } from "node:crypto";

export type PetMediaProvider = "cloudru-documents" | "isolated-avatar" | "legacy-yandex";
export type PetMediaReason = "pet-delete" | "document-delete" | "candidate" | "photo-replaced";
export type PetMediaIntent = Readonly<{
  id: string; ownerId: string; petId: string; locator: string;
  provider: PetMediaProvider; dedupeKey: string; reason: PetMediaReason;
  status: "pending" | "processing" | "done";
  attemptToken: string | null; leaseUntil: Date | null; attempts: number;
}>;
const segment = "[A-Za-z0-9_-]{1,128}";
const photo = new RegExp(`^users/(${segment})/pets/(${segment})/[A-Za-z0-9_.-]{1,128}\\.(?:jpg|jpeg|png|webp|gif)$`);
const document = new RegExp(`^users/(${segment})/pets/(${segment})/documents/[A-Za-z0-9_.-]{1,128}\\.(?:pdf|jpg|jpeg|png)$`);
const isolatedPhoto = new RegExp(`^users/(${segment})/pets/(${segment})/[a-f0-9-]{36}\\.(?:jpg|jpeg|png|webp|gif)$`);
const marker = "isodev-avatar:documents/uploads/";
const cloud = "cloudru:documents:documents/uploads/";
const yandexHosts = [
  "https://storage.yandexcloud.net/gafus-media/uploads/",
  "https://gafus-media.storage.yandexcloud.net/uploads/",
];

/** No arbitrary URL, traversal, CDN signature, storage bucket inference or
 * cross-owner key. Only immutable storage locators already used by Pets. */
export function describePetMediaLocator(ownerId: string, petId: string, locator: string):
  { provider: PetMediaProvider; locator: string } {
  if (!ownerId || !petId || !locator || locator.length > 1024 ||
      !new RegExp(`^${segment}$`).test(ownerId) ||
      !new RegExp(`^${segment}$`).test(petId))
    throw new Error("PET_MEDIA_INVALID_OWNER_OR_LOCATOR");
  const provider: PetMediaProvider = locator.startsWith(cloud) ? "cloudru-documents"
    : locator.startsWith(marker) ? "isolated-avatar" : "legacy-yandex";
  let path: string;
  if (provider === "cloudru-documents") path = locator.slice(cloud.length);
  else if (provider === "isolated-avatar") path = locator.slice(marker.length);
  else {
    const prefix = yandexHosts.find(value => locator.startsWith(value));
    path = prefix ? locator.slice(prefix.length) : locator;
    if (path.startsWith("uploads/")) path = path.slice("uploads/".length);
    if (path.includes(":") || path.includes("?") || path.includes("#"))
      throw new Error("PET_MEDIA_PROVIDER_DENIED");
  }
  const match = (provider === "cloudru-documents" ? document : photo).exec(path) ??
    (provider === "legacy-yandex" ? document.exec(path) : null);
  if (!match || match[1] !== ownerId || match[2] !== petId ||
      (provider === "isolated-avatar" && !isolatedPhoto.test(path)))
    throw new Error("PET_MEDIA_OWNER_OR_PROVIDER_MISMATCH");
  return { provider, locator };
}

/** Review-only legacy source resolution. This intentionally does not
 * expose a DELETE adapter, S3 credentials or a provider-enabled switch.
 * Yandex's `gafus-media` is separate from Cloud.ru Documents and Gallery;
 * even a successful current HEAD 404 may conceal historical object versions.
 */
export function describeLegacyPetMediaDeletionPlan(
  ownerId: string, petId: string, locator: string,
): {
  provider: "legacy-yandex";
  bucket: "gafus-media";
  key: string;
  sourceForm: "path-host" | "bucket-host" | "relative";
  activation: "DENIED_PENDING_VERSIONED_HEAD_REVIEW";
} {
  const described = describePetMediaLocator(ownerId, petId, locator);
  if (described.provider !== "legacy-yandex")
    throw new Error("PET_MEDIA_NOT_LEGACY_YANDEX");
  const sourceForm = locator.startsWith(yandexHosts[0]!) ? "path-host"
    : locator.startsWith(yandexHosts[1]!) ? "bucket-host" : "relative";
  const prefix = yandexHosts.find(host => locator.startsWith(host));
  const relative = prefix ? locator.slice(prefix.length) : locator;
  const key = "uploads/" + (relative.startsWith("uploads/")
    ? relative.slice("uploads/".length) : relative);
  // The original uploader stores under uploads/, not the cloudru documents
  // prefix. Preserve this precise key so a future owner can verify versions.
  if (!key.startsWith(`uploads/users/${ownerId}/pets/${petId}/`))
    throw new Error("PET_MEDIA_LEGACY_NAMESPACE_DENIED");
  return {
    provider: "legacy-yandex", bucket: "gafus-media", key, sourceForm,
    activation: "DENIED_PENDING_VERSIONED_HEAD_REVIEW",
  };
}

/** The dedupe identity never contains a signed URL or the raw storage key. */
export function petMediaDedupeKey(ownerId: string, locator: string): string {
  return createHash("sha256").update(ownerId + "\0" + locator).digest("hex");
}

/** The SQL port must fence the exact owner namespace before any storage IO:
 * User FOR UPDATE for a live owner, or the immutable public
 * AccountStorageCleanup(public) row for an already deleted owner, plus a
 * transaction-scoped advisory owner lock in both cases. Both public and
 * documents cleanup scope rows are locked; a concurrently processing account
 * cleanup with an active lease prevents a competing Pet media attempt.
 * Missing tombstone and reused ID fail closed. An installed, enabled
 * deferred User ID-reuse trigger is ALSO REQUIRED before any deleted-owner
 * provider call (a tombstone row cannot fence an otherwise unguarded INSERT).
 * Check references globally,
 * through provider HEAD confirmation and token-fenced CAS. Other owner's
 * references must prevent deletion. Provider ACK loss remains retryable.
 */
export interface PetMediaDeletionPort {
  withOwnerFence<T>(ownerId: string, operation: () => Promise<T>): Promise<T>;
  isLeaseCurrent(id: string, token: string): Promise<boolean>;
  hasActiveReference(locator: string): Promise<boolean>;
  deleteAndVerify(provider: PetMediaProvider, locator: string): Promise<void>;
  complete(id: string, token: string): Promise<boolean>;
  release(id: string, token: string, retryAfterMs: number): Promise<void>;
}
export type PetMediaRunResult = "done" | "already-done" | "protected" | "retry" | "stale";

/** Exactly one claimed attempt. Lease renewal/claim is an adapter-owned SQL
 * SKIP LOCKED + attempt-token CAS; this function cannot forge lease ownership.
 * Exceptions are deliberately masked and translated into bounded retry state. */
export async function runClaimedPetMediaDeletion(
  job: PetMediaIntent, port: PetMediaDeletionPort,
): Promise<PetMediaRunResult> {
  if (job.status === "done") return "already-done";
  const token = job.attemptToken;
  if (job.status !== "processing" || !token || !job.leaseUntil ||
      job.leaseUntil.getTime() <= Date.now() ||
      !(await port.isLeaseCurrent(job.id, token))) return "stale";
  try {
    const verified = describePetMediaLocator(job.ownerId, job.petId, job.locator);
    if (job.provider !== verified.provider)
      throw new Error("PET_MEDIA_PROVIDER_MISMATCH");
    if (petMediaDedupeKey(job.ownerId, job.locator) !== job.dedupeKey)
      throw new Error("PET_MEDIA_INVALID_DEDUPE");
    return await port.withOwnerFence(job.ownerId, async () => {
      if (!(await port.isLeaseCurrent(job.id, token))) return "stale";
      if (await port.hasActiveReference(job.locator)) {
        await port.release(job.id, token, 60_000);
        return "protected";
      }
      // Provider delete may have succeeded before its ACK was lost. Delete
      // must therefore be idempotent and verify physical absence with HEAD.
      await port.deleteAndVerify(job.provider, job.locator);
      // The SQL adapter must CAS both token and lease; a late completion
      // cannot mark a re-claimed job done.
      return (await port.complete(job.id, token)) ? "done" : "stale";
    });
  } catch {
    const delay = Math.min(3_600_000, 30_000 * 2 ** Math.min(job.attempts, 7));
    try { await port.release(job.id, token, delay); } catch { /* stale token is safe */ }
    return "retry";
  }
}
