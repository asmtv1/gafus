/** Five concurrent browser-to-private-S3 transfers at most per action.
 * Failed actions drain already in-flight POSTs before returning an error;
 * retry must retain the same clientRequestId for each earlier transfer.
 * Completion order never changes the array returned to a versioned revision.
 */
export async function momentUploadPool<T, U>(
  items: readonly T[], upload: (item: T, index: number) => Promise<U>,
  limit = 5,
): Promise<U[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5) {
    throw new RangeError("Unsupported Moments upload concurrency");
  }
  const result = new Array<U>(items.length);
  let cursor = 0;
  let failed: { reason: unknown } | null = null;
  const next = async () => {
    while (cursor < items.length && !failed) {
      const index = cursor++;
      try {
        result[index] = await upload(items[index]!, index);
      } catch (reason) {
        failed ??= { reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  if (failed) throw (failed as { reason: unknown }).reason;
  return result;
}
