import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton, SecondaryButton } from "../../shared/ui";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { RouteLink } from "../../shared/router/location";
import type { DurableMarker } from "./reminderV2DurableSourceMock";
import {
  REMINDER_V2_FIXTURE,
  reminderV2LookupPath,
  classifyV2Create,
  classifyV2CreateError,
  classifyV2Lookup,
  classifyV2DurableLookup,
  type ReminderV2Status,
} from "./reminderV2SourceCandidate";
import {
  projectReminders,
  validateReminderChanges,
  classifyReminderAck,
  reminderPath,
  reminderError,
  dayLabels,
  validateReminderCreate,
  classifyReminderCreateAck,
  matchesNewReminder,
  classifyReminderDeleteAck,
  reminderListMatchesOperation,
  type TrainingReminder,
  type ReminderChanges,
  type ReminderResult,
  type SyntheticReminderTransport,
  type ReminderCreateBody,
} from "./remindersSourceMock";

/** Optional, fully synthetic POST form, distinct from legacy notification/PWA flows. */
function ReminderCreate({
  ownerId,
  transport,
  existing,
  isCurrent,
  onClose,
  onAttempt,
  onReadback,
  restored,
}: {
  ownerId: string;
  transport: SyntheticReminderTransport;
  existing: TrainingReminder[];
  isCurrent: () => boolean;
  onClose(): void;
  onAttempt(): void;
  onReadback(rows: TrainingReminder[]): void;
  restored?: DurableMarker | null;
}) {
  const [name, setName] = useState("");
  const [time, setTime] = useState("09:00");
  const [zone, setZone] = useState("UTC");
  const [days, setDays] = useState<string | null>(null);
  const [error, setError] = useState("");
  const v2 = transport.v2?.fixtureKind === REMINDER_V2_FIXTURE ? transport.v2 : null;
  const oldIntent = v2?.journal.read(ownerId) ?? null;
  const [phase, setPhase] = useState<"form" | "pending" | "result">(
    oldIntent || restored ? "result" : "form",
  );
  const [result, setResult] = useState<ReminderResult | null>(null);
  const [readback, setReadback] = useState<"idle" | "pending" | "match" | "not-proven">("idle");
  const [v2State, setV2State] = useState<ReminderV2Status | null>(
    restored?.phase === "SERVER_COMMITTED_UNVERIFIED_DRAFT"
      ? "SERVER_COMMITTED_UNVERIFIED_DRAFT"
      : restored
        ? "UNKNOWN"
        : (oldIntent?.status ?? null),
  );
  const [durableFault, setDurableFault] = useState(false);
  const attempted = useRef(!!oldIntent || !!restored);
  const readOnce = useRef(false);
  const mounted = useRef(true);
  const submitted = useRef<ReminderCreateBody | null>(null);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const safe = () => mounted.current && isCurrent();
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!safe() || attempted.current || (!transport.create && !v2)) return;
    if (existing.length >= 5) {
      setError("Максимум 5 напоминаний.");
      return;
    }
    const validated = validateReminderCreate({
      name,
      reminderTime: time,
      reminderDays: days,
      timezone: zone,
    });
    if (!validated.ok) {
      setError(validated.message);
      return;
    }
    attempted.current = true;
    onAttempt();
    setError("");
    setPhase("pending");
    submitted.current = validated.body;
    if (v2) {
      // One operation UUID is generated AFTER validation and before the
      // only POST. Journal stays injected in-memory across remount. No
      // clientRequestId body field; never retry after UNKNOWN/timeout.
      let intent: ReturnType<typeof v2.journal.begin>;
      try {
        intent = v2.journal.begin(ownerId, validated.body, crypto.randomUUID());
      } catch {
        intent = null;
      }
      if (!intent) {
        setV2State("UNKNOWN");
        setPhase("result");
        return;
      }
      // Persist PREPARED, then MAY_HAVE_SENT before ANY network mutation.
      // Failure, unknown owner/epoch, concurrent tab or failed CAS => no POST.
      let sent: DurableMarker | null = null;
      if (v2.durable) {
        const prepared = await v2.durable.reserve(intent.idempotencyKey);
        if (!prepared || !safe()) {
          if (safe()) {
            setDurableFault(true);
            setV2State("UNKNOWN");
            setPhase("result");
          }
          return;
        }
        sent = await v2.durable.beforeSend(prepared);
        if (!sent || !safe()) {
          if (safe()) {
            setV2State("UNKNOWN");
            setPhase("result");
          }
          return;
        }
      }
      try {
        const raw = await v2.create({
          ownerId,
          method: "POST",
          path: "/api/v1/reminders",
          headers: { "Idempotency-Key": intent.idempotencyKey },
          body: intent.body,
        });
        if (!safe()) return;
        const classified = classifyV2Create(raw, intent.body);
        if (sent) {
          const stored = await v2.durable!.mark(
            sent,
            classified.kind === "ACK_MOCK"
              ? "COMMITTED"
              : ["REJECTED_CAP", "CONFLICT_TERMINAL", "REJECTED"].includes(classified.kind)
                ? "REJECTED"
                : "UNKNOWN",
          );
          if (!stored || !safe()) {
            if (safe()) {
              v2.journal.set(ownerId, "UNKNOWN");
              setV2State("UNKNOWN");
            }
            setPhase("result");
            return;
          }
        }
        v2.journal.set(ownerId, classified.kind);
        setV2State(classified.kind);
      } catch (error) {
        if (safe()) {
          const classified = classifyV2CreateError(error);
          if (sent) {
            const stored = await v2.durable!.mark(
              sent,
              ["REJECTED_CAP", "CONFLICT_TERMINAL", "REJECTED"].includes(classified.kind)
                ? "REJECTED"
                : "UNKNOWN",
            );
            if (!stored || !safe()) {
              if (safe()) {
                v2.journal.set(ownerId, "UNKNOWN");
                setV2State("UNKNOWN");
              }
              setPhase("result");
              return;
            }
          }
          v2.journal.set(ownerId, classified.kind);
          setV2State(classified.kind);
        }
      }
      if (safe()) setPhase("result");
      return;
    }
    try {
      const raw = await transport.create!({
        ownerId,
        method: "POST",
        path: "/api/v1/reminders",
        body: validated.body,
      });
      if (!safe()) return;
      setResult(classifyReminderCreateAck(raw, validated.body));
    } catch {
      if (safe()) setResult({ kind: "UNKNOWN" });
    }
    if (safe()) setPhase("result");
  };
  const verify = async () => {
    if (v2) {
      if (!safe() || readOnce.current) return;
      let key: string | null = null,
        previous: DurableMarker | null = null;
      if (v2.durable) {
        const state = await v2.durable.read();
        if (!safe() || state.kind !== "owned") return;
        previous = state.marker;
        if (["REJECTED", "COMMITTED", "SERVER_COMMITTED_UNVERIFIED_DRAFT"].includes(previous.phase))
          return;
        key = previous.operationKey;
      } else key = v2.journal.takeLookup(ownerId)?.idempotencyKey ?? null;
      if (!key || !safe()) return;
      readOnce.current = true;
      setReadback("pending");
      try {
        const raw = await v2.lookup({ ownerId, method: "GET", path: reminderV2LookupPath(key) });
        if (!safe()) return;
        const intent = v2.journal.read(ownerId);
        const status = previous
          ? classifyV2DurableLookup(raw)
          : classifyV2Lookup(raw, intent?.body ?? submitted.current!);
        if (previous) {
          const saved = await v2.durable!.mark(
            previous,
            status === "SERVER_COMMITTED_UNVERIFIED_DRAFT"
              ? "SERVER_COMMITTED_UNVERIFIED_DRAFT"
              : "UNKNOWN",
          );
          if (!saved || !safe()) {
            if (safe()) {
              setV2State("LOOKUP_UNKNOWN");
              setReadback("not-proven");
            }
            return;
          }
        }
        if (intent) v2.journal.set(ownerId, status);
        setV2State(status);
        setReadback(
          ["LOOKUP_COMMITTED", "SERVER_COMMITTED_UNVERIFIED_DRAFT"].includes(status)
            ? "match"
            : "not-proven",
        );
      } catch {
        if (!safe()) return;
        if (previous) await v2.durable!.mark(previous, "UNKNOWN");
        if (safe()) {
          v2.journal.set(ownerId, "LOOKUP_UNKNOWN");
          setV2State("LOOKUP_UNKNOWN");
          setReadback("not-proven");
        }
      }
      return;
    }
    if (!safe() || readOnce.current || !submitted.current) return;
    readOnce.current = true;
    setReadback("pending");
    try {
      const values = projectReminders(
        await transport.list({
          ownerId,
          method: "GET",
          path: "/api/v1/reminders",
        }),
      );
      if (!safe()) return;
      const before = new Set(existing.map((x) => x.id));
      const newRows = values.filter(
        (x) => !before.has(x.id) && matchesNewReminder(x, submitted.current!),
      );
      setReadback(newRows.length === 1 ? "match" : "not-proven");
      onReadback(values);
    } catch {
      if (safe()) setReadback("not-proven");
    }
  };
  return (
    <section className="reminder-create" aria-label="Создание напоминания (макет)">
      <h4>Новое напоминание</h4>
      {phase === "form" ? (
        <form aria-label="Создать напоминание" onSubmit={(e) => void send(e)}>
          <label htmlFor="reminder-create-name">Название</label>
          <input
            id="reminder-create-name"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label htmlFor="reminder-create-time">Время</label>
          <input
            id="reminder-create-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <label htmlFor="reminder-create-zone">Часовой пояс</label>
          <input
            id="reminder-create-zone"
            maxLength={100}
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          />
          <fieldset className="reminder-days">
            <legend>Дни недели</legend>
            {dayLabels.map((label, i) => {
              const key = String(i + 1),
                active = days === null || days.split(",").includes(key);
              return (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => {
                      const next = new Set(
                        days === null
                          ? dayLabels.map((_, j) => String(j + 1))
                          : days.split(",").filter(Boolean),
                      );
                      if (e.target.checked) next.add(key);
                      else next.delete(key);
                      setDays(next.size === 7 ? null : [...next].sort().join(","));
                    }}
                  />
                  {label}
                </label>
              );
            })}
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <div className="profile-edit-actions">
            <PrimaryButton type="submit">Создать (макет)</PrimaryButton>
            <SecondaryButton variant="red" type="button"  onClick={onClose}>
              Отмена
            </SecondaryButton>
          </div>
        </form>
      ) : phase === "pending" ? (
        <Loading message="Проверяем макет создания…" />
      ) : (
        <div className="reminder-create-result">
          {v2 ? (
            durableFault ? (
              <p role="alert">Не удалось безопасно сохранить операцию. POST не отправлен.</p>
            ) : v2State === "SERVER_COMMITTED_UNVERIFIED_DRAFT" ? (
              <p role="status">
                Сервер подтвердил создание для этой операции. Исходные поля после перезапуска не
                сверены.
              </p>
            ) : v2State === "ACK_MOCK" ? (
              <p role="status">Только синтетический ACK V2 создания. Сервер не изменён.</p>
            ) : v2State === "LOOKUP_COMMITTED" ? (
              <p role="status">Только синтетический GET подтвердил COMMITTED для операции.</p>
            ) : v2State === "REJECTED_CAP" ? (
              <p role="alert">Достигнут лимит: максимум 5 напоминаний (400).</p>
            ) : v2State === "CONFLICT_TERMINAL" ? (
              <p role="alert">Конфликт ключа операции (409). Повторное создание запрещено.</p>
            ) : v2State === "REJECTED" ? (
              <p role="alert">
                Сервер отклонил создание. Повторное создание этой операцией запрещено.
              </p>
            ) : (
              <p role="alert">
                Результат операции V2 неизвестен. Не отправляйте POST повторно — требуется проверка
                владельцем.
              </p>
            )
          ) : result?.kind === "ACK_MOCK" ? (
            <p role="status">Только синтетический ACK создания. Сервер не изменён.</p>
          ) : result?.kind === "REJECTED" ? (
            <p role="alert">{reminderError(result.status)}</p>
          ) : (
            <p role="alert">Результат создания неизвестен. Не повторяйте POST автоматически.</p>
          )}
          {v2
            ? !durableFault &&
              ["UNKNOWN", "LOOKUP_UNKNOWN"].includes(v2State ?? "") &&
              (restored
                ? !["COMMITTED", "REJECTED", "SERVER_COMMITTED_UNVERIFIED_DRAFT"].includes(
                    restored.phase,
                  )
                : !v2.journal.read(ownerId)?.lookupUsed) &&
              readback === "idle" && (
                <PrimaryButton type="button" onClick={() => void verify()}>
                  Проверить операцию у владельца (макет)
                </PrimaryButton>
              )
            : readback === "idle" && (
                <PrimaryButton type="button" onClick={() => void verify()}>
                  Проверить список (макет)
                </PrimaryButton>
              )}
          {readback === "pending" && (
            <Loading variant="compact"
              message={v2 ? "Проверяем результат операции…" : "Проверяем список…"} />
          )}
          {readback === "match" && (
            <p role="status">
              {v2
                ? restored
                  ? "SERVER_COMMITTED_UNVERIFIED_DRAFT: сервер подтвердил создание. Исходные поля после перезапуска не сверены."
                  : "COMMITTED подтверждён только синтетическим GET."
                : "В синтетическом списке найден новый совпадающий ID. Это не доказывает результат конкретного POST."}
            </p>
          )}
          {readback === "not-proven" && (
            <p role="status">Создание не подтверждено. Не выполняйте автоматический повтор.</p>
          )}
          <button type="button" className="button-secondary" onClick={onClose}>
            К списку напоминаний
          </button>
        </div>
      )}
    </section>
  );
}
type ListStatus = "loading" | "ready" | "error";
const listPath = "/api/v1/reminders" as const;
function BoundedReminders({
  ownerId,
  transport,
}: {
  ownerId: string;
  transport: SyntheticReminderTransport;
}) {
  const client = useQueryClient();
  const initial = useRef(client.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null);
  const v2 = transport.v2?.fixtureKind === REMINDER_V2_FIXTURE ? transport.v2 : null;
  const fingerprint = (user: AuthUser | null) =>
    user &&
    JSON.stringify([
      user.id,
      user.username,
      user.role,
      (user as AuthUser & { sessionRevision?: unknown }).sessionRevision ?? null,
    ]);
  const initialIdentity = useRef(
    fingerprint(client.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY) ?? null),
  );
  const epoch = useRef(0);
  const seenPrincipal = useRef(v2 ? initialIdentity.current : initial.current);
  const version = useSyncExternalStore(
    (callback) =>
      client.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey.length === CURRENT_USER_QUERY_KEY.length &&
          event.query.queryKey.every((p: unknown, i: number) => p === CURRENT_USER_QUERY_KEY[i])
        ) {
          const user = client.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY) ?? null;
          const next = v2 ? fingerprint(user) : (user?.id ?? null);
          if (
            next !== seenPrincipal.current &&
            (next !== null || event.type === "removed" || event.query.state.data === null)
          ) {
            seenPrincipal.current = next;
            epoch.current++;
            callback();
          }
        }
      }),
    () => epoch.current,
    () => epoch.current,
  );
  const current = client.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
  const valid = () =>
    epoch.current === 0 &&
    client.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === ownerId &&
    (!v2 ||
      fingerprint(client.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY) ?? null) ===
        initialIdentity.current);
  const authOk = initial.current === ownerId && current?.id === ownerId && version === 0;
  const [entered, setEntered] = useState(false);
  if (!authOk) return <p role="alert">Сессия изменилась. Откройте профиль заново.</p>;
  return entered ? (
    <RemindersScreen
      ownerId={ownerId}
      transport={transport}
      isCurrent={valid}
      onClose={() => setEntered(false)}
    />
  ) : (
    <div className="reminders-optin-entry">
      <button type="button" onClick={() => setEntered(true)}>
        Напоминания о тренировках (макет)
      </button>
      <p className="note">Просмотр и изменение настроек без отправки push</p>
    </div>
  );
}
function RemindersScreen({
  ownerId,
  transport,
  isCurrent,
  onClose,
}: {
  ownerId: string;
  transport: SyntheticReminderTransport;
  isCurrent: () => boolean;
  onClose: () => void;
}) {
  const alive = useRef(true);
  const currentRef = useRef(isCurrent);
  currentRef.current = isCurrent;
  const safe = () => alive.current && currentRef.current();
  const [status, setStatus] = useState<ListStatus>("loading");
  const [error, setError] = useState("");
  const [items, setItems] = useState<TrainingReminder[]>([]);
  const [selected, setSelected] = useState<TrainingReminder | null>(null);
  const [creating, setCreating] = useState(!!transport.v2?.journal.read(ownerId));
  const [draft, setDraft] = useState<TrainingReminder | null>(null);
  const [phase, setPhase] = useState<"form" | "delete-confirm" | "result">("form");
  const [result, setResult] = useState<ReminderResult | null>(null);
  const [attempted, setAttempted] = useState(!!transport.v2?.journal.read(ownerId));
  const durable = transport.v2?.durable ?? null;
  const [durableState, setDurableState] = useState<"loading" | "ready" | "blocked">(
    durable ? "loading" : "ready",
  );
  const [restored, setRestored] = useState<DurableMarker | null>(null);
  const submitted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [readbackState, setReadbackState] = useState<"idle" | "loading" | "match" | "not-proven">(
    "idle",
  );
  const readRequested = useRef(false);
  const lastChanges = useRef<ReminderChanges | null>(null);
  const lastOperation = useRef<"update" | "toggle" | "delete">("update");
  const [revision, setRevision] = useState(0);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!durable) return;
    let cancelled = false;
    void durable
      .read()
      .then((value) => {
        if (cancelled || !safe()) return;
        if (value.kind === "empty") {
          setDurableState("ready");
          return;
        }
        if (value.kind === "owned") {
          // No assumptions after cold restart, even for PREPARED.
          setRestored(value.marker);
          setAttempted(true);
          setCreating(true);
          setDurableState("ready");
          return;
        }
        setDurableState("blocked");
      })
      .catch(() => {
        if (!cancelled && safe()) setDurableState("blocked");
      });
    return () => {
      cancelled = true;
    };
  }, [durable, ownerId]);
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");
    void transport
      .list({ ownerId, method: "GET", path: listPath })
      .then((data) => {
        if (cancelled || !safe()) return;
        setItems(projectReminders(data));
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled || !safe()) return;
        setStatus("error");
        const code =
          typeof error === "object" && error !== null && "status" in error
            ? Number(error.status)
            : undefined;
        setError(reminderError(code));
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId, transport, revision]);
  const open = (item: TrainingReminder) => {
    if (attempted || !safe()) return;
    setSelected(item);
    setDraft({ ...item });
    setPhase("form");
    setError("");
    setReadbackState("idle");
    submitted.current = false;
    readRequested.current = false;
  };
  const change = <K extends keyof TrainingReminder>(key: K, value: TrainingReminder[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  /** One user intent triggers at most one mutation, followed by owner-scoped GET. */
  const readbackFor = async (
    item: TrainingReminder,
    operation: "update" | "toggle" | "delete",
    changes: ReminderChanges | null,
  ) => {
    try {
      const rows = projectReminders(
        await transport.list({
          ownerId,
          method: "GET",
          path: listPath,
        }),
      );
      if (!safe()) return;
      setReadbackState(
        reminderListMatchesOperation(rows, item.id, operation, changes) ? "match" : "not-proven",
      );
      setItems(rows);
    } catch {
      if (safe()) setReadbackState("not-proven");
    }
  };
  const execute = async (
    item: TrainingReminder,
    operation: "update" | "toggle" | "delete",
    changes: ReminderChanges | null,
  ) => {
    if (!safe() || submitted.current || attempted) return;
    if (operation === "delete" && !transport.delete) return;
    submitted.current = true;
    setAttempted(true);
    setBusy(true);
    lastChanges.current = changes;
    lastOperation.current = operation;
    setSelected(item);
    setPhase("result");
    setReadbackState("loading");
    setError("");
    try {
      const raw =
        operation === "delete"
          ? await transport.delete!({ ownerId, method: "DELETE", path: reminderPath(item.id) })
          : await transport.update({
              ownerId,
              method: "PUT",
              path: reminderPath(item.id),
              changes: changes!,
            });
      if (!safe()) return;
      setResult(
        operation === "delete"
          ? classifyReminderDeleteAck(raw)
          : classifyReminderAck(raw, item.id, changes!),
      );
    } catch {
      if (safe()) setResult({ kind: "UNKNOWN" });
    }
    if (safe()) await readbackFor(item, operation, changes);
    if (safe()) setBusy(false);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !draft || !safe() || submitted.current || phase !== "form") return;
    const checked = validateReminderChanges(selected, draft);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    await execute(selected, "update", checked.changes);
  };
  const toggle = async (item: TrainingReminder) => {
    if (!safe() || attempted || selected || creating) return;
    const checked = validateReminderChanges(item, { ...item, enabled: !item.enabled });
    if (!checked.ok) return;
    await execute(item, "toggle", checked.changes);
  };
  const promptDelete = (item: TrainingReminder) => {
    if (!safe() || attempted || selected || creating || !transport.delete) return;
    setSelected(item);
    setDraft(null);
    setPhase("delete-confirm");
    setResult(null);
    setError("");
    setReadbackState("idle");
  };
  const confirmDelete = async () => {
    if (!selected || phase !== "delete-confirm" || !safe() || submitted.current) return;
    await execute(selected, "delete", null);
  };
  const readback = async () => {
    if (!selected || !safe() || readRequested.current || busy) return;
    readRequested.current = true;
    setReadbackState("loading");
    await readbackFor(selected, lastOperation.current, lastChanges.current);
  };
  return (
    <section className="reminders-panel" aria-label="Настройки напоминаний">
      <header className="reminders-heading">
        <h3>Напоминания о тренировках</h3>
        <BackButton type="button" onClick={onClose} disabled={busy}>Мой профиль</BackButton>
      </header>
      <p className="note">Макет: без реальных сохранений, фоновых задач и браузерных push.</p>
      {status === "loading" && <Loading message="Загружаем напоминания…" />}
      {status === "error" && (
        <div role="alert">
          <p>{error}</p>
          <PrimaryButton type="button" onClick={() => setRevision((v) => v + 1)}>
            Повторить загрузку
          </PrimaryButton>
        </div>
      )}
      {status === "ready" && (
        <>
          <p className="note">Напоминаний: {items.length} из 5</p>
          {items.length === 0 && (
            <p role="status" className="empty-state">
              Напоминаний пока нет.
            </p>
          )}
          {durableState === "loading" && <Loading message="Проверяем сохранённую операцию…" />}
          {durableState === "blocked" && (
            <p role="alert">Состояние операции недоступно. Новое создание заблокировано.</p>
          )}
          {!creating &&
            durableState === "ready" &&
            (transport.create || transport.v2) &&
            items.length < 5 &&
            !attempted && (
              <PrimaryButton type="button" onClick={() => setCreating(true)}>
                Добавить напоминание (макет)
              </PrimaryButton>
            )}
          {creating && durableState === "ready" && (transport.create || transport.v2) && (
            <ReminderCreate
              ownerId={ownerId}
              transport={transport}
              existing={items}
              isCurrent={isCurrent}
              onAttempt={() => setAttempted(true)}
              restored={restored}
              onReadback={(rows) => setItems(rows)}
              onClose={() => setCreating(false)}
            />
          )}
          <ul className="reminder-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.reminderTime} ·{" "}
                    {item.reminderDays
                      ? item.reminderDays
                          .split(",")
                          .map((day) => dayLabels[Number(day) - 1])
                          .join(", ")
                      : "Каждый день"}
                    {" · "}
                    {item.timezone}
                  </small>
                  <span>{item.enabled ? "Включено" : "Выключено"}</span>
                </div>
                <div className="reminder-actions">
                  <button
                    type="button"
                    disabled={attempted || selected !== null || creating}
                    onClick={() => open(item)}
                  >
                    Настроить
                  </button>
                  <button
                    type="button"
                    disabled={attempted || selected !== null || creating}
                    onClick={() => void toggle(item)}
                  >
                    {item.enabled ? "Выключить (макет)" : "Включить (макет)"}
                  </button>
                  {transport.delete && (
                    <SecondaryButton variant="red"
                      type="button"

                      disabled={attempted || selected !== null || creating}
                      onClick={() => promptDelete(item)}
                    >
                      Удалить (макет)
                    </SecondaryButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!selected && items.length > 0 && !transport.delete && (
            <p className="note">Удаление напоминаний здесь недоступно.</p>
          )}
          {selected && (
            <section className="reminder-edit">
              {phase === "form" && draft ? (
                <form aria-label="Изменить напоминание" onSubmit={(event) => void submit(event)}>
                  <h4>Настройка: {selected.name}</h4>
                  <label htmlFor="reminder-name">Название</label>
                  <input
                    id="reminder-name"
                    name="name"
                    maxLength={100}
                    value={draft.name}
                    onChange={(e) => change("name", e.target.value)}
                    disabled={busy}
                  />
                  <label htmlFor="reminder-time">Время</label>
                  <input
                    id="reminder-time"
                    name="reminderTime"
                    type="time"
                    value={draft.reminderTime}
                    onChange={(e) => change("reminderTime", e.target.value)}
                    disabled={busy}
                  />
                  <label htmlFor="reminder-timezone">Часовой пояс</label>
                  <input
                    id="reminder-timezone"
                    name="timezone"
                    value={draft.timezone}
                    maxLength={100}
                    onChange={(e) => change("timezone", e.target.value)}
                    disabled={busy}
                  />
                  <fieldset className="reminder-days">
                    <legend>Дни недели</legend>
                    {dayLabels.map((label, index) => {
                      const key = String(index + 1);
                      const isDaily = draft.reminderDays === null;
                      const selectedDays = draft.reminderDays?.split(",") ?? [];
                      return (
                        <label key={key}>
                          <input
                            type="checkbox"
                            name={"day-" + key}
                            checked={isDaily || selectedDays.includes(key)}
                            disabled={busy}
                            onChange={(e) => {
                              const set = new Set(
                                isDaily ? dayLabels.map((_, i) => String(i + 1)) : selectedDays,
                              );
                              if (e.target.checked) set.add(key);
                              else set.delete(key);
                              change(
                                "reminderDays",
                                set.size === 7 ? null : [...set].sort().join(","),
                              );
                            }}
                          />
                          {label}
                        </label>
                      );
                    })}
                  </fieldset>
                  <label className="reminder-enabled">
                    <input
                      type="checkbox"
                      name="enabled"
                      checked={draft.enabled}
                      disabled={busy}
                      onChange={(e) => change("enabled", e.target.checked)}
                    />
                    Напоминание включено
                  </label>
                  {error && <p role="alert">{error}</p>}
                  <div className="profile-edit-actions">
                    <PrimaryButton type="submit" disabled={busy}>
                      {busy ? "Проверяем макет…" : "Сохранить настройки (макет)"}
                    </PrimaryButton>
                    <SecondaryButton variant="red"

                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setSelected(null);
                        setDraft(null);
                      }}
                    >
                      Отмена
                    </SecondaryButton>
                  </div>
                </form>
              ) : phase === "delete-confirm" ? (
                <div className="reminder-confirm" aria-label="Подтверждение удаления">
                  <h4>Удалить «{selected.name}»?</h4>
                  <p>После удаления восстановить напоминание автоматически нельзя.</p>
                  <div className="profile-edit-actions">
                    <SecondaryButton variant="red" type="button" onClick={() => void confirmDelete()}>
                      Подтвердить удаление (макет)
                    </SecondaryButton>
                    <SecondaryButton variant="red"
                      type="button"

                      onClick={() => {
                        setSelected(null);
                        setDraft(null);
                      }}
                    >
                      Отмена
                    </SecondaryButton>
                  </div>
                </div>
              ) : (
                <div className="reminder-result" aria-label="Результат настройки">
                  {busy && !result ? (
                    <p role="status">Отправляем и проверяем синтетические данные…</p>
                  ) : result?.kind === "ACK_MOCK" ? (
                    <p role="status">Только синтетический ACK. Настройки на сервере не изменены.</p>
                  ) : result?.kind === "REJECTED" ? (
                    <p role="alert">{reminderError(result.status)}</p>
                  ) : (
                    <p role="alert">Результат неизвестен. Не повторяйте сохранение без проверки.</p>
                  )}
                  {!readRequested.current && !busy && (
                    <PrimaryButton type="button" onClick={() => void readback()}>
                      Проверить настройку (макет)
                    </PrimaryButton>
                  )}
                  {readbackState === "loading" && <Loading message="Проверяем состояние…" />}
                  {readbackState === "match" && (
                    <p role="status">
                      {lastOperation.current === "delete"
                        ? "Отсутствие ID подтверждено только синтетическим GET."
                        : "Данные совпали только в синтетическом readback. Реальное сохранение не подтверждено."}
                    </p>
                  )}
                  {readbackState === "not-proven" && (
                    <p role="status">
                      Сохранение не подтверждено: GET не доказывает выполнение конкретной мутации.
                      Автоматически повторять запрос нельзя.
                    </p>
                  )}
                  <button
                    className="button-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSelected(null);
                      setDraft(null);
                    }}
                  >
                    К списку напоминаний
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
      <p>
        <RouteLink to="/profile">Мой профиль</RouteLink>
      </p>
    </section>
  );
}
/** Explicit fixture only and session/ABA guard on entry; no normal API transport. */
export function RemindersOptIn({
  enabled,
  userId,
  transport,
}: {
  enabled: boolean;
  userId: string;
  transport?: SyntheticReminderTransport;
}) {
  if (
    !enabled ||
    transport?.fixtureKind !== "AG2_REMINDER_SETTINGS_SYNTHETIC_ONLY" ||
    (transport.v2 && transport.v2.fixtureKind !== REMINDER_V2_FIXTURE)
  )
    return null;
  return <BoundedReminders key={userId} ownerId={userId} transport={transport} />;
}
