/**
 * G05 AG2 Web real-consumer preparation ONLY. This module has no fetch, Hono,
 * React route or global side-effects: an authorized runner injects the wire
 * port only after AG4 WEB grant AND AG1 READY AND AG3 DONE. Never auto-retry.
 */
import { interpretPetCreateReply, type PetCreateBody, type PetReply } from "./petCreateS1";
import {
  confirmPetIntentWithVerifiedReplyS1,
  markPetIntentS1,
  newPetCreateIntentS1,
  prepareSyntheticFirstAttemptS1,
  prepareSyntheticManualRetryS1,
  toPetCreateJsonProposalS1,
  type PetCreateBindingS1,
  type PetCreateIntentS1,
  type SyntheticAttemptS1,
} from "./petCreateIntentS1";

export type G05WireRequest = Readonly<{
  jsonText: string;
  binding: PetCreateBindingS1;
  /** Source-only fixture port; never cache a JWT in the intent or request. */
}>;
export type G05WirePort = (request: G05WireRequest) => Promise<PetReply>;
export type G05ConsumerResult =
  | { kind: "confirmed"; petId: string }
  | { kind: "unknown"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "editable-error"; message: string }
  | { kind: "reauth-required"; message: string }
  | { kind: "denied"; message: string }
  | { kind: "blocked"; message: string };
export type G05ConsumerState = "idle" | "pending" | "unknown" | "confirmed" | "conflict" | "abandoned";

const UNKNOWN = "Результат создания не подтверждён. Проверьте список питомцев перед повторной попыткой.";
const CONFLICT = "Создание отклонено из-за конфликта. Проверьте список питомцев; новая попытка требует нового действия.";
const SESSION = "Сессия изменилась. Проверьте список питомцев; старую операцию нельзя повторять под другой сессией.";
const REAUTH = "Сессия требует подтверждения. Проверьте список питомцев, затем повторите вручную в той же подтверждённой сессии.";
const BLOCKED = "Операция недоступна для текущей сессии.";
const same = (a: PetCreateBindingS1 | null, b: PetCreateBindingS1): boolean =>
  !!a && a.ownerId === b.ownerId && a.authEpoch === b.authEpoch &&
    a.sessionScope === b.sessionScope;
const frozenBinding = (b: PetCreateBindingS1): PetCreateBindingS1 =>
  Object.freeze({...b});

/**
 * A single logical create operation, not a reusable auto-request utility.
 * Receipts are in memory only. Changing owner/authEpoch/sessionScope fences
 * old callbacks permanently, including A -> B -> A.
 */
export class G05WebRealConsumerAdapter {
  private current: PetCreateBindingS1 | null = null;
  private intent: PetCreateIntentS1 | null = null;
  private serialized = "";
  private inFlight = false;
  private fenced = false;
  private state: G05ConsumerState = "idle";
  private attempts = 0;

  constructor(private readonly port: G05WirePort) {}

  setSession(session: PetCreateBindingS1 | null): void {
    if (this.intent && (!session || !same(this.current, session))) {
      this.fenced = true; // A -> B -> A must NOT reactivate the old intent.
    }
    this.current = session ? frozenBinding(session) : null;
  }

  get snapshot(): Readonly<{
    state: G05ConsumerState;
    attempts: number;
    fenced: boolean;
    inFlight: boolean;
  }> {
    return Object.freeze({
      state: this.state, attempts: this.attempts,
      fenced: this.fenced, inFlight: this.inFlight,
    });
  }

  /** Explicit user create only; never silently mint a second key. */
  begin(body: PetCreateBody, newUuid?: () => string): boolean {
    if (!this.current || this.inFlight || this.intent || this.fenced) return false;
    this.intent = newPetCreateIntentS1(
      body, this.current, newUuid,
    );
    const first = prepareSyntheticFirstAttemptS1(this.intent, this.current);
    if (!first) throw new Error("G05 initial intent invalid");
    this.serialized = JSON.stringify(toPetCreateJsonProposalS1(first));
    this.state = "idle";
    return true;
  }

  /** Explicit first commit. No network until the caller actively invokes it. */
  first(): Promise<G05ConsumerResult> {
    if (!this.intent || !this.current || this.fenced || this.attempts ||
        this.inFlight || this.state !== "idle")
      return Promise.resolve({kind: "blocked", message: BLOCKED});
    const attempt = prepareSyntheticFirstAttemptS1(this.intent, this.current);
    return attempt ? this.execute(attempt) :
      Promise.resolve({kind: "blocked", message: BLOCKED});
  }

  /** After unknown, retry ONLY on a separately received manual user action. */
  manualRetry(explicitUserAction: boolean): Promise<G05ConsumerResult> {
    if (!explicitUserAction || !this.intent || !this.current || this.fenced ||
        this.inFlight || this.state !== "unknown")
      return Promise.resolve({kind: "blocked", message: BLOCKED});
    const attempt = prepareSyntheticManualRetryS1(
      this.intent, this.current, explicitUserAction,
    );
    return attempt ? this.execute(attempt) :
      Promise.resolve({kind: "blocked", message: BLOCKED});
  }

  private async execute(attempt: SyntheticAttemptS1): Promise<G05ConsumerResult> {
    const intent = this.intent;
    const binding = this.current;
    if (!intent || !binding || !same(intent.binding, binding) ||
        this.fenced || this.inFlight)
      return {kind: "blocked", message: BLOCKED};
    const encoded = JSON.stringify(toPetCreateJsonProposalS1(attempt));
    // Exact byte identity, not just semantically equivalent JSON.
    if (encoded !== this.serialized) throw new Error("G05_CHANGED_RETRY_PAYLOAD");
    this.inFlight = true;
    this.state = "pending";
    this.attempts++;
    let reply: PetReply | null = null;
    try {
      reply = await this.port({jsonText: encoded, binding: frozenBinding(binding)});
    } catch {
      // The transport could reject AFTER SQL COMMIT: NOT proof of no write.
    } finally {
      this.inFlight = false;
    }
    if (this.fenced || !same(this.current, binding) ||
        !same(intent.binding, this.current ?? {ownerId:"",authEpoch:-1,sessionScope:""})) {
      this.state = "unknown";
      if (this.intent?.state === "pending") this.intent = markPetIntentS1(this.intent, "unknown");
      return {kind: "blocked", message: SESSION};
    }
    if (!reply || !Number.isInteger(reply.status)) return this.unknown();
    if (reply.status === 409) {
      this.state = "conflict";
      this.intent = markPetIntentS1(this.intent!, "abandoned");
      return {kind: "conflict", message: CONFLICT};
    }
    if (reply.status === 401) {
      // Keep key and exact payload for a later EXPLICIT retry only after a
      // reattested unchanged owner/authEpoch/sessionScope. No token caching.
      this.state = "unknown";
      this.intent = markPetIntentS1(this.intent!, "unknown");
      return {kind: "reauth-required", message: REAUTH};
    }
    const classified = interpretPetCreateReply(reply, binding.ownerId, intent.body);
    if (classified.kind === "confirmed") {
      this.intent = confirmPetIntentWithVerifiedReplyS1(this.intent!, classified);
      this.state = "confirmed";
      return {kind: "confirmed", petId: classified.pet.id};
    }
    if (classified.kind === "editable-error") {
      this.state = "abandoned";
      this.intent = markPetIntentS1(this.intent!, "abandoned");
      return classified;
    }
    if (classified.kind === "denied") {
      this.state = "abandoned";
      this.intent = markPetIntentS1(this.intent!, "abandoned");
      return classified;
    }
    return this.unknown();
  }

  private unknown(): G05ConsumerResult {
    this.state = "unknown";
    this.intent = markPetIntentS1(this.intent!, "unknown");
    return {kind: "unknown", message: UNKNOWN};
  }
}
