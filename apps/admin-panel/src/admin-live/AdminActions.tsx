import { useState, type FormEvent } from "react";
import { requestAdmin } from "./api";

type Field = {
  name: string;
  title: string;
  kind?: "select" | "textarea" | "number";
  options?: readonly string[];
  required?: boolean;
};
type Operation = {
  title: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: (inputs: Record<string, string>) => string;
  fields: Field[];
  makeBody: (values: Record<string, string>) => unknown;
  warning?: string;
};
const secureId = (id: string) => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw Error("Некорректный ID");
  return id;
};
const fixed = (base: string, id: string) => base + "/" + secureId(id);
const reason: Field = { name: "reason", title: "Причина", kind: "textarea", required: true };
const reportId: Field = { name: "reportId", title: "ID жалобы", required: true };
const userId: Field = { name: "userId", title: "ID пользователя", required: true };
const partnerId: Field = { name: "partnerId", title: "ID партнёра", required: true };
const opt = (values: Record<string, string>, key: string) => values[key]?.trim() || undefined;

export const adminOperations: Record<string, Operation[]> = {
  "feed-moderation": [
    {
      title: "Решение по жалобе на момент",
      method: "POST",
      endpoint: (v) => fixed("/api/v1/admin/moderation/feed/reports", v.reportId),
      fields: [
        reportId,
        {
          name: "action",
          title: "Действие",
          kind: "select",
          options: ["dismiss", "hide", "delete", "restore", "block", "unblock"],
          required: true,
        },
        reason,
      ],
      makeBody: (v) => ({ action: v.action, reason: v.reason }),
      warning: "Действие меняет видимость или доступ к публикации.",
    },
  ],
  questions: [
    {
      title: "Модерация вопроса",
      method: "POST",
      endpoint: () => "/api/v1/admin/moderation/questions/reports",
      fields: [
        reportId,
        {
          name: "action",
          title: "Действие",
          kind: "select",
          options: ["dismiss", "hide", "delete", "close", "block"],
          required: true,
        },
        reason,
      ],
      makeBody: (v) => ({ reportId: secureId(v.reportId), action: v.action, reason: v.reason }),
      warning: "Операция изменит статус вопроса или пользователя.",
    },
    {
      title: "Снять блокировку вопросов",
      method: "DELETE",
      endpoint: (v) => fixed("/api/v1/admin/moderation/questions/blocks", v.userId),
      fields: [userId],
      makeBody: () => undefined,
    },
  ],
  users: [
    {
      title: "Изменить данные пользователя",
      method: "PATCH",
      endpoint: (v) => fixed("/api/v1/admin/users", v.userId),
      fields: [
        userId,
        { name: "username", title: "Новый username" },
        { name: "email", title: "Новый email" },
        { name: "phone", title: "Новый телефон" },
      ],
      makeBody: (v) =>
        Object.fromEntries(
          ["username", "email", "phone"]
            .filter((key) => opt(v, key) !== undefined)
            .map((key) => [key, v[key].trim()]),
        ),
    },
    {
      title: "Удалить пользователя",
      method: "DELETE",
      endpoint: (v) => fixed("/api/v1/admin/users", v.userId),
      fields: [userId, { name: "confirm", title: "Введите УДАЛИТЬ", required: true }],
      makeBody: (v) => {
        if (v.confirm !== "УДАЛИТЬ") throw Error("Подтвердите удаление словом УДАЛИТЬ");
        return undefined;
      },
      warning: "Необратимое удаление аккаунта и связанные операции очистки.",
    },
  ],
  partners: [
    {
      title: "Отметить баланс партнёра выплаченным",
      method: "POST",
      endpoint: (v) => fixed("/api/v1/admin/partners", v.partnerId) + "/mark-paid",
      fields: [partnerId],
      makeBody: () => undefined,
      warning: "Бухгалтерское подтверждение выплаты, не отправка денег в банк.",
    },
  ],
  reengagement: [
    {
      title: "Ручной запуск re-engagement",
      method: "POST",
      endpoint: () => "/api/v1/admin/reengagement/run",
      fields: [{ name: "confirm", title: "Введите ЗАПУСТИТЬ", required: true }],
      makeBody: (v) => {
        if (v.confirm !== "ЗАПУСТИТЬ") throw Error("Для запуска введите ЗАПУСТИТЬ");
        return { confirmation: "RUN_REENGAGEMENT" };
      },
      warning:
        "Планировщик проверит неактивных пользователей и может поставить уведомления в очередь.",
    },
  ],
  broadcasts: [
    {
      title: "Отправить push-рассылку",
      method: "POST",
      endpoint: () => "/api/v1/admin/broadcasts",
      fields: [
        { name: "title", title: "Заголовок", required: true },
        { name: "body", title: "Текст рассылки", kind: "textarea", required: true },
        { name: "url", title: "Путь внутри приложения (необязательно)" },
        { name: "confirm", title: "Введите РАССЫЛКА", required: true },
      ],
      makeBody: (v) => {
        if (v.confirm !== "РАССЫЛКА") throw Error("Для отправки введите РАССЫЛКА");
        return {
          title: v.title,
          body: v.body,
          url: opt(v, "url"),
          confirmation: "SEND_TO_ALL_SUBSCRIBERS",
        };
      },
      warning: "Отправляет сообщения всем подпискам. Автоматических повторов нет.",
    },
  ],
  gafus: [
    {
      title: "Разбор антифрод-сигнала",
      method: "POST",
      endpoint: (v) => fixed("/api/v1/admin/gafus-operations/fraud", v.signalId) + "/review",
      fields: [
        { name: "signalId", title: "ID сигнала", required: true },
        {
          name: "action",
          title: "Решение",
          kind: "select",
          options: ["DISMISS", "CONFIRM"],
          required: true,
        },
        {
          name: "requestedReversal",
          title: "Списать гафусов (0–10000)",
          kind: "number",
          required: true,
        },
        reason,
      ],
      makeBody: (v) => ({
        action: v.action,
        reason: v.reason,
        requestedReversal: v.action === "DISMISS" ? 0 : Number(v.requestedReversal),
      }),
      warning: "Подтверждение может списать гафусы, только в пределах доступного баланса.",
    },
  ],
  "app-subscriptions": [
    {
      title: "Создать промокод",
      method: "POST",
      endpoint: () => "/api/v1/admin/app-subscriptions/promo-codes",
      fields: [
        { name: "code", title: "Код", required: true },
        { name: "discountPercent", title: "Скидка, % (1–50)", kind: "number", required: true },
        {
          name: "isActive",
          title: "Активен",
          kind: "select",
          options: ["true", "false"],
          required: true,
        },
      ],
      makeBody: (v) => ({
        code: v.code,
        discountPercent: Number(v.discountPercent),
        isActive: v.isActive === "true",
      }),
    },
  ],
};

function OperationForm({ spec, onSaved }: { spec: Operation; onSaved: () => void }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<
      string,
      string
    >;
    setError(null);
    setResult(null);
    try {
      const body = spec.makeBody(data);
      const url = spec.endpoint(data);
      if (body && typeof body === "object" && Object.keys(body).length === 0) {
        throw Error("Укажите хотя бы одно новое значение");
      }
      if (spec.warning && !window.confirm(`${spec.warning} Продолжить?`)) return;
      setPending(true);
      await requestAdmin(url, { method: spec.method, body });
      setResult("Операция подтверждена сервером. Обновляем данные.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Операция не выполнена");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="operation" onSubmit={submit}>
      <h3>{spec.title}</h3>
      {spec.warning && <p className="note">{spec.warning}</p>}
      {spec.fields.map((field) => (
        <label key={field.name}>
          {field.title}
          {field.kind === "select" ? (
            <select name={field.name} required={field.required} defaultValue={field.options?.[0]}>
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : field.kind === "textarea" ? (
            <textarea name={field.name} required={field.required} rows={3} />
          ) : (
            <input
              name={field.name}
              type={field.kind ?? "text"}
              required={field.required}
              autoComplete="off"
            />
          )}
        </label>
      ))}
      <button type="submit" disabled={pending}>
        {pending ? "Сохраняем…" : "Применить"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="success">
          {result}
        </p>
      )}
    </form>
  );
}
export function AdminActions({ sectionKey, onSaved }: { sectionKey: string; onSaved: () => void }) {
  const operations = adminOperations[sectionKey] ?? [];
  if (!operations.length) return null;
  return (
    <details className="action-panel">
      <summary>Административные действия</summary>
      <div className="operation-grid">
        {operations.map((spec) => (
          <OperationForm key={spec.title} spec={spec} onSaved={onSaved} />
        ))}
      </div>
    </details>
  );
}
