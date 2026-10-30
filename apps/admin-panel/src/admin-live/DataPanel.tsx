import { useMemo, useState } from "react";

type Json = null | string | number | boolean | Json[] | { [key: string]: Json };
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const listCandidates = (value: Record<string, unknown>): [string, unknown[]][] =>
  Object.entries(value).filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]));
const keyNames: Record<string, string> = {
  username: "Пользователь",
  userId: "Пользователь (ID)",
  id: "ID",
  role: "Роль",
  createdAt: "Создано",
  updatedAt: "Обновлено",
  status: "Статус",
  name: "Название",
  fullName: "Имя",
  title: "Заголовок",
  reason: "Причина",
  balance: "Баланс",
  total: "Всего",
  count: "Количество",
  email: "Email",
  isListed: "В каталоге",
  active: "Активно",
  amountKopecks: "Сумма, коп.",
};
function format(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number")
    return Number.isFinite(value) ? value.toLocaleString("ru-RU") : "—";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return date.toLocaleString("ru-RU");
    }
    return value;
  }
  if (Array.isArray(value)) return value.length ? `Элементов: ${value.length}` : "—";
  return `Поля: ${Object.keys(value).length}`;
}
export function DataTable({ rows, title }: { rows: unknown[]; title: string }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (!search.trim()) return true;
        const text = JSON.stringify(row ?? "");
        return text.toLocaleLowerCase("ru-RU").includes(search.toLocaleLowerCase("ru-RU"));
      }),
    [rows, search],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 15));
  const current = Math.min(page, totalPages);
  const shown = filtered.slice((current - 1) * 15, current * 15);
  const columns = Array.from(
    new Set(shown.flatMap((row) => (isObject(row) ? Object.keys(row) : ["value"]))),
  ).slice(0, 9);
  return (
    <section className="data-section" aria-label={title}>
      <div className="data-head">
        <h3>
          {title} <small>{filtered.length}</small>
        </h3>
        <label>
          Поиск в загруженных строках
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Поиск"
            aria-label={`Поиск — ${title}`}
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="empty">Нет записей</p>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th scope="col" key={col}>
                      {keyNames[col] ?? col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row, index) => (
                  <tr key={isObject(row) && typeof row.id === "string" ? row.id : index}>
                    {columns.map((col) => (
                      <td key={col} title={format(isObject(row) ? row[col] : row)}>
                        {format(isObject(row) ? row[col] : row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={current === 1} onClick={() => setPage(current - 1)}>
                Назад
              </button>
              <span>
                Страница {current} из {totalPages}
              </span>
              <button disabled={current === totalPages} onClick={() => setPage(current + 1)}>
                Дальше
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
export function DataPanel({ data, title }: { data: unknown; title: string }) {
  if (Array.isArray(data)) return <DataTable rows={data} title={title} />;
  if (!isObject(data)) return <p>{format(data)}</p>;
  const rows = listCandidates(data);
  const scalars = Object.entries(data).filter(
    ([, value]) => !Array.isArray(value) && !isObject(value),
  );
  const nested = Object.entries(data).filter(([, value]) => isObject(value));
  return (
    <div className="panel-stack">
      {scalars.length > 0 && (
        <div className="metric-grid">
          {scalars.map(([key, value]) => (
            <article key={key} className="metric">
              <span>{keyNames[key] ?? key}</span>
              <strong>{format(value)}</strong>
            </article>
          ))}
        </div>
      )}
      {nested.map(([key, obj]) => (
        <section key={key} className="nested-section">
          <h3>{keyNames[key] ?? key}</h3>
          <DataPanel data={obj} title={key} />
        </section>
      ))}
      {rows.map(([key, value]) => (
        <DataTable key={key} rows={value} title={keyNames[key] ?? key} />
      ))}
      {Object.keys(data).length === 0 && <p className="empty">Данных пока нет</p>}
    </div>
  );
}
export type { Json };
