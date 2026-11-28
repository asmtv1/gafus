/**
 * Serializes native expo-video source changes. SDK 55 can release a VideoPlayer
 * while replaceAsync is still resolving; a released SharedObject then throws
 * NativeSharedObjectNotFoundException on its next native property access.
 *
 * The owner must exclusively own/release the player passed to this controller.
 */
export class SerializedVideoSource<TSource> {
  private tail: Promise<void> = Promise.resolve();
  private wanted = 0;
  private closed = false;
  private released = false;

  constructor(private readonly player: {
    replaceAsync(source: TSource): Promise<void>;
    pause(): void;
    release(): void;
  }) {}

  replace(source: TSource, onReady: () => void): Promise<void> {
    if (this.closed) return Promise.resolve();
    const request = ++this.wanted;
    const operation = this.tail.then(async () => {
      // Ignore intermediate selections while an earlier native swap completes.
      if (this.closed || request !== this.wanted) return;
      await this.player.replaceAsync(source);
      if (!this.closed && request === this.wanted) onReady();
    });
    // A rejected replacement must not block later user quality selections.
    this.tail = operation.catch(() => { /* diagnostic: expected Serialization tail absorbs failure; original operation retains rejection. */ return undefined; });
    return operation;
  }

  /** Includes thumbnail generation in the same native queue as MP4 replacement.
   * A pending thumbnail must also finish before the SharedObject is released. */
  perform<T>(operation: () => Promise<T>, onReady: (result: T) => void): Promise<void> {
    if (this.closed) return Promise.resolve();
    const job = this.tail.then(async () => {
      if (this.closed) return;
      const result = await operation();
      if (!this.closed) onReady(result);
    });
    this.tail = job.catch(() => { /* diagnostic: expected Serialization tail absorbs failure; original job retains rejection. */ return undefined; });
    return job;
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    ++this.wanted;
    // Never call release() until replaceAsync settles. Defer even the idle
    // release to a microtask so child/parent effect cleanups can detach views.
    void this.tail.then(() => {
      if (this.released) return;
      this.released = true;
      try { this.player.pause(); } catch { /* diagnostic: expected Stopping an already stopped player is benign cleanup. */  /* already stopped */ }
      this.player.release();
    });
  }
}
