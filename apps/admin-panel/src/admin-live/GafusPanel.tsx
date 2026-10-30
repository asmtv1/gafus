import { useState, type FormEvent } from "react";
import { DataPanel } from "./DataPanel";
import { requestAdmin } from "./api";

type SettingKey =
  | "postReward"
  | "questionReward"
  | "answerReward"
  | "activityLimit"
  | "activityWindowSeconds"
  | "reactionThreshold"
  | "reactionReward"
  | "bestAnswerReward"
  | "courseStepCost"
  | "miniGuideCost"
  | "accessDurationSeconds";
const fields: [SettingKey, string][] = [
  ["postReward", "Награда за пост"],
  ["questionReward", "Награда за вопрос"],
  ["answerReward", "Награда за ответ"],
  ["activityLimit", "Лимит за окно"],
  ["activityWindowSeconds", "Окно активности (сек.)"],
  ["reactionThreshold", "Реакций на порог"],
  ["reactionReward", "Награда за реакции"],
  ["bestAnswerReward", "Награда за лучший ответ"],
  ["courseStepCost", "Стоимость шага"],
  ["miniGuideCost", "Стоимость мини-гайда"],
  ["accessDurationSeconds", "Срок доступа (сек.)"],
];
type Settings = Record<SettingKey, number> & {
  revision: number;
  economyEnabled: boolean;
  earningEnabled: boolean;
  spendingEnabled: boolean;
};
type Dashboard = {
  settings: Settings;
  wallets: { count: number; outstanding: number };
  transactions: { kind: string; _sum: { delta: number | null } }[];
  fraudOpen: number;
};
type Signal = {
  id: string;
  kind: string;
  severity: string;
  createdAt: string;
  userId: string;
  entityType: string | null;
  entityId: string | null;
};
type Preflight = {
  activeWallets: number;
  credits: number;
  imported: number;
  pendingRefundWallets: number;
  pendingRefundCredits: number;
  unsettledSessions: number;
  cutoverDisabled: boolean;
  importEnabled: boolean;
};
const validId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);
function isDashboard(value: unknown): value is Dashboard {
  return (
    value !== null &&
    typeof value === "object" &&
    "settings" in value &&
    "wallets" in value &&
    "transactions" in value
  );
}
function GafusDashboard({ source, onSaved }: { source: unknown; onSaved: () => void }) {
  const [draft, setDraft] = useState<Settings>(() =>
    isDashboard(source) ? structuredClone(source.settings) : ({} as Settings),
  );
  const [reason, setReason] = useState("");
  const [userId, setUserId] = useState("");
  const [delta, setDelta] = useState("1");
  const [adjustReason, setAdjustReason] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!isDashboard(source)) return <p role="alert">Некорректный отчёт экономики</p>;
  const { wallets, transactions, fraudOpen } = source;
  const earned = transactions
    .filter((row) => row.kind === "EARN")
    .reduce((sum, row) => sum + Math.max(0, row._sum.delta ?? 0), 0);
  const spent = transactions
    .filter((row) => row.kind === "SPEND")
    .reduce((sum, row) => sum + Math.abs(row._sum.delta ?? 0), 0);
  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || reason.trim().length < 5) return;
    if (!window.confirm("Обновить экономику гафусов? Изменения затронут начисления и списания."))
      return;
    setError(null);
    setPending(true);
    setMessage(null);
    try {
      const { revision, ...patch } = draft;
      await requestAdmin("/api/v1/gafus/admin/settings", {
        method: "PATCH",
        body: { expectedRevision: revision, reason: reason.trim(), patch },
      });
      setMessage("Настройки сохранены. Сверяем ревизию.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка настроек");
    } finally {
      setPending(false);
    }
  }
  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const amount = Number(delta);
    if (
      !validId(userId) ||
      !Number.isSafeInteger(amount) ||
      amount === 0 ||
      Math.abs(amount) > 10000 ||
      adjustReason.trim().length < 5
    ) {
      setError("Неверный ID, сумма или причина");
      return;
    }
    if (!window.confirm(`Изменить баланс пользователя ${userId} на ${amount} гафусов?`)) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await requestAdmin("/api/v1/gafus/admin/adjust", {
        method: "POST",
        body: { userId, delta: amount, requestId, reason: adjustReason.trim() },
      });
      setRequestId(crypto.randomUUID()); // Do not rotate until a confirmed response.
      setMessage("Баланс скорректирован. Повторный запрос со старым ID не списал бы сумму дважды.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка корректировки");
    } finally {
      setPending(false);
    }
  }
  const checks = [
    ["economyEnabled", "Экономика включена"],
    ["earningEnabled", "Начисления включены"],
    ["spendingEnabled", "Списания включены"],
  ] as const;
  return (
    <div className="panel-stack">
      <section className="content-card">
        <h2>Гафусы — управление экономикой</h2>
        <p className="note">Ревизия настроек: {draft.revision}. Изменения фиксируются в аудите.</p>
        <div className="metric-grid">
          {[
            ["Кошельков", wallets.count],
            ["В обращении", wallets.outstanding],
            ["Начислено", earned],
            ["Потрачено", spent],
            ["Антифрод: открытые", fraudOpen],
          ].map(([key, val]) => (
            <div className="metric" key={key}>
              <span>{key}</span>
              <strong>{Number(val).toLocaleString("ru-RU")}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="content-card">
        <h2>Настройки гафусов</h2>
        <form onSubmit={submitSettings} className="settings-editor">
          <div className="operation-grid">
            {checks.map(([key, title]) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={draft[key] ?? false}
                  onChange={(e) => setDraft((old) => ({ ...old, [key]: e.target.checked }))}
                />
                {title}
              </label>
            ))}
          </div>
          <div className="operation-grid">
            {fields.map(([key, title]) => (
              <label key={key}>
                {title}
                <input
                  required
                  type="number"
                  step="1"
                  min={
                    key.includes("Cost") || key.endsWith("Seconds") || key === "reactionThreshold"
                      ? 1
                      : 0
                  }
                  value={draft[key] ?? 0}
                  onChange={(e) =>
                    setDraft((old) => ({
                      ...old,
                      [key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <label>
            Причина изменения
            <textarea
              required
              minLength={5}
              maxLength={1000}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={pending} type="submit">
            Сохранить настройки
          </button>
        </form>
      </section>
      <section className="content-card">
        <h2>Корректировка кошелька</h2>
        <p className="note">
          Каждая операция попадает в журнал. Ключ запроса сохраняется при сбое сети.
        </p>
        <form className="inline-form" onSubmit={adjust}>
          <label>
            ID пользователя
            <input
              required
              maxLength={128}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </label>
          <label>
            Изменение баланса
            <input
              required
              type="number"
              step="1"
              min={-10000}
              max={10000}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
          </label>
          <label>
            Причина
            <textarea
              required
              minLength={5}
              maxLength={1000}
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />
          </label>
          <button disabled={pending} type="submit">
            Применить корректировку
          </button>
        </form>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
    </div>
  );
}
type FraudDraft = { reason: string; amount: string };
const initialFraudDraft: FraudDraft = { reason: "", amount: "1" };
function validReversal(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= 10000;
}
function GafusFraud({ source, onSaved }: { source: unknown; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, FraudDraft>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!Array.isArray(source)) return <p role="alert">Неверный список антифрод-сигналов</p>;
  const signals = source as Signal[];
  function changeDraft(id: string, patch: Partial<FraudDraft>) {
    setDrafts((old) => ({
      ...old,
      [id]: { ...(old[id] ?? initialFraudDraft), ...patch },
    }));
  }
  async function decide(id: string, action: "CONFIRM" | "DISMISS") {
    const draft = drafts[id] ?? initialFraudDraft;
    if (!validId(id) || pending) return;
    if (draft.reason.trim().length < 5 || draft.reason.trim().length > 1000 ||
        (action === "CONFIRM" && !validReversal(draft.amount))) {
      setError("Укажите причину от 5 до 1000 символов и целую сумму от 0 до 10000");
      return;
    }
    if (action === "CONFIRM" &&
        !window.confirm(`Подтвердить нарушение ${id} и списать ${draft.amount}?`)) return;
    setPending(id);
    setError(null);
    try {
      await requestAdmin(`/api/v1/admin/gafus-operations/fraud/${id}/review`, {
        method: "POST",
        body: {
          action,
          reason: draft.reason.trim(),
          requestedReversal: action === "CONFIRM" ? Number(draft.amount) : 0,
        },
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка антифрода");
    } finally {
      setPending(null);
    }
  }
  return (
    <section className="content-card">
      <h2>Антифрод: сигналы для проверки</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!signals.length && <p className="empty">Открытых сигналов нет</p>}
      {signals.map((signal) => {
        const draft = drafts[signal.id] ?? initialFraudDraft;
        return (
          <article key={signal.id} className="moderation-report">
            <h3>{signal.kind} · {signal.severity}</h3>
            <p>{new Date(signal.createdAt).toLocaleString("ru-RU")}</p>
            <p>
              Пользователь: {signal.userId} · Объект: {signal.entityType ?? "—"} /
              {signal.entityId ?? "—"}
            </p>
            <label>
              Результат проверки
              <textarea
                aria-label={`Результат проверки ${signal.id}`}
                required
                minLength={5}
                maxLength={1000}
                value={draft.reason}
                onChange={(event) => changeDraft(signal.id, { reason: event.target.value })}
              />
            </label>
            <label>
              Списать при подтверждении (не больше доступного баланса)
              <input
                aria-label={`Списание ${signal.id}`}
                type="number"
                min="0"
                max="10000"
                step="1"
                value={draft.amount}
                onChange={(event) => changeDraft(signal.id, { amount: event.target.value })}
              />
            </label>
            <div className="action-row">
              <button
                className="secondary"
                disabled={!!pending}
                onClick={() => void decide(signal.id, "DISMISS")}
              >
                Отклонить сигнал
              </button>
              <button disabled={!!pending} onClick={() => void decide(signal.id, "CONFIRM")}>
                Подтвердить нарушение
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
function GafusMigration({ source, onSaved }: { source: unknown; onSaved: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!source || typeof source !== "object" || !("cutoverDisabled" in source)) return null;
  const data = source as Preflight;
  const canImport =
    data.cutoverDisabled &&
    data.importEnabled &&
    data.pendingRefundCredits === 0 &&
    data.unsettledSessions === 0;
  async function run() {
    if (!confirmed || !canImport || pending) return;
    if (!window.confirm("Перенести до 50 старых кошельков? Это изменит баланс пользователей."))
      return;
    setPending(true);
    setError(null);
    setSummary(null);
    try {
      const result = await requestAdmin<{
        imported: number;
        processed: number;
        credits: number;
        replays: number;
        nextCursor: string | null;
      }>("/api/v1/admin/gafus-operations/legacy/import", {
        method: "POST",
        body: { confirmation: "IMPORT_LEGACY_GAFUS", ...(cursor ? { cursor } : {}) },
      });
      setSummary(
        `Обработано: ${result.processed}; перенесено кошельков: ${result.imported}; ` +
          `Гафусов: ${result.credits}; повторов без списания: ${result.replays}`,
      );
      setCursor(result.nextCursor ?? null);
      setConfirmed(false);
      // Preserve continuation cursor on this mounted form. Reload only at the end.
      if (!result.nextCursor) onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка переноса");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="content-card">
      <h2>Переход со старых rewarded-кредитов</h2>
      <p className="note">Только операторская миграция. Старые записи сохраняются для аудита.</p>
      <DataPanel data={data} title="Проверка условий" />
      {!canImport && (
        <p className="error" role="alert">
          Перенос заблокирован: требуется отключить старые операции, включить импорт и закрыть
          возвраты и рекламные сессии.
        </p>
      )}
      {summary && (
        <p role="status" className="success">
          {summary}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!canImport}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Подтверждаю перенос партии максимум из 50 кошельков
      </label>
      <button disabled={!canImport || !confirmed || pending} onClick={() => void run()}>
        {pending ? "Переносим…" : cursor ? "Следующая партия" : "Начать перенос"}
      </button>
    </section>
  );
}
export function GafusPanel({
  source,
  tab,
  onSaved,
}: {
  source: unknown;
  tab: "dashboard" | "fraud" | "preflight";
  onSaved: () => void;
}) {
  return tab === "dashboard" ? (
    <GafusDashboard source={source} onSaved={onSaved} />
  ) : tab === "fraud" ? (
    <GafusFraud source={source} onSaved={onSaved} />
  ) : (
    <GafusMigration source={source} onSaved={onSaved} />
  );
}
