/**
 * Platform-neutral, bounded feed telemetry queue shared by Web and Mobile.
 * Only server-generated opaque exposure tokens are persisted, never user profiles.
 */
export interface FeedTelemetryStorage {
  read: () => Promise<string | null>;
  write: (payload: string) => Promise<void>;
}

export interface TelemetryEvent {
  eventId: string;
}

export interface TelemetrySendResult {
  accepted: number;
  /** Distinguishes temporary Redis unavailability from invalid/expired exposures. */
  retryable?: boolean;
}

interface StoredEvent<T> {
  value: T;
  queuedAt: number;
}

export class FeedTelemetryQueue<T extends TelemetryEvent> {
  private pending: StoredEvent<T>[] = [];
  private inflight: Promise<boolean> | null = null;
  private persistence: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: FeedTelemetryStorage,
    private readonly send: (events: T[]) => Promise<TelemetrySendResult>,
    private readonly now = () => Date.now(),
    private readonly maxAgeMs = 14 * 60_000,
    private readonly maxEvents = 150,
    private readonly batchSize = 30,
  ) {}

  private prune() {
    const now = this.now();
    this.pending = this.pending.filter(entry =>
      entry.queuedAt <= now && now - entry.queuedAt < this.maxAgeMs);
  }

  private persist() {
    this.prune();
    const serialized = JSON.stringify(this.pending);
    this.persistence = this.persistence.catch(() => {}).then(() => this.storage.write(serialized));
    return this.persistence;
  }

  /** Restore only after the owner-specific storage key is known. */
  async restore() {
    const raw = await this.storage.read().catch(() => null);
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const known = new Set(this.pending.map(entry => entry.value.eventId));
      const now = this.now();
      for (const entry of parsed.slice(0, this.maxEvents)) {
        if (!entry || typeof entry !== "object") continue;
        const candidate = entry as { value?: T; queuedAt?: number };
        if (!candidate.value || typeof candidate.value.eventId !== "string" ||
            !Number.isFinite(candidate.queuedAt) ||
            (candidate.queuedAt as number) > now ||
            now - (candidate.queuedAt as number) >= this.maxAgeMs ||
            known.has(candidate.value.eventId)) continue;
        this.pending.push({ value: candidate.value, queuedAt: candidate.queuedAt as number });
        known.add(candidate.value.eventId);
      }
      this.pending = this.pending.slice(-this.maxEvents);
    } catch { /* corrupt local cache is not a reason to break a feed */ }
  }

  enqueue(event: T) {
    this.prune();
    if (!this.pending.some(entry => entry.value.eventId === event.eventId)) {
      this.pending.push({ value: event, queuedAt: this.now() });
      this.pending = this.pending.slice(-this.maxEvents);
      void this.persist().catch(() => {});
    }
  }

  get size() {
    this.prune();
    return this.pending.length;
  }

  /** True means transport answered and did not request a retry; duplicates are OK. */
  flush(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    this.prune();
    const batch = this.pending.slice(0, this.batchSize);
    if (!batch.length) return Promise.resolve(true);
    const work = (async () => {
      try {
        const result = await this.send(batch.map(entry => entry.value));
        if (result.retryable) return false;
        const sent = new Set(batch.map(entry => entry.value.eventId));
        this.pending = this.pending.filter(entry => !sent.has(entry.value.eventId));
        await this.persist().catch(() => {});
        return true;
      } catch {
        await this.persist().catch(() => {});
        return false;
      }
    })();
    this.inflight = work.finally(() => { this.inflight = null; });
    return this.inflight;
  }
}
