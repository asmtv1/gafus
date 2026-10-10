/** Bound Redis request latency even when BullMQ's Redis client retries indefinitely. */
export async function smartRedisTimeout<T>(request: Promise<T>, milliseconds = 750): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Smart feed cache timeout")), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
