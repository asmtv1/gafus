import { useMemo, useState } from "react";
import { matchesCatalogSearch } from "./live/trainerCatalogSearch";

export type DailyStatsContentData = {
  title: string;
  summary: {
    openedUsers: number; startedUsers: number;
    completedUsers: number; openedWithoutStartUsers: number;
  };
  users: {
    userId: string; username: string; status: string;
    completedSteps: number; totalSteps: number; currentStepTitle: string | null;
    openedAt: string; lastActivityAt: string;
    steps: { bundleStepId: string; title: string; status: string }[];
  }[];
};
const readable = (date: string) => new Date(date).toLocaleString("ru-RU", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const readableStatus = (status: string) => ({
  COMPLETED: "Завершено", IN_PROGRESS: "В процессе", NOT_STARTED: "Не начато",
  OPENED: "Открыто", PAUSED: "Приостановлено",
} as Record<string, string>)[status] ?? status;

export function TrainerDailyStatisticsContent({ data }: { data: DailyStatsContentData }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState<"activity" | "name" | "progress">("activity");
  const [page, setPage] = useState(0);
  const statuses = [...new Set(data.users.map(user => user.status))].sort();
  const filtered = useMemo(() => data.users.filter(user =>
    (status === "ALL" || user.status === status) &&
    matchesCatalogSearch(query, [user.username, user.userId,
      user.currentStepTitle, ...user.steps.map(step => step.title)]),
  ).sort((a, b) => sort === "name" ? a.username.localeCompare(b.username, "ru") :
    sort === "progress" ?
      (b.totalSteps ? b.completedSteps / b.totalSteps : 0) -
      (a.totalSteps ? a.completedSteps / a.totalSteps : 0) :
      b.lastActivityAt.localeCompare(a.lastActivityAt)),
  [data.users, query, status, sort]);
  const maxPages = Math.max(1, Math.ceil(filtered.length / 20));
  const active = Math.min(page, maxPages - 1);
  const users = filtered.slice(active * 20, active * 20 + 20);
  const resetPage = () => setPage(0);
  return <section className="trainer-workspace-statistics" aria-label="Статистика выбранного дня">
    <div className="trainer-workspace-kpis" aria-label="Сводка курса дня">
      <div><span>Открыли день</span><strong>{data.summary.openedUsers}</strong></div>
      <div><span>Начали шаги</span><strong>{data.summary.startedUsers}</strong></div>
      <div><span>Завершили день</span><strong>{data.summary.completedUsers}</strong></div>
      <div><span>Открыли без старта</span><strong>{data.summary.openedWithoutStartUsers}</strong></div>
    </div>
    <div className="trainer-workspace-panel">
      <h2>Участники дня</h2>
      <div className="trainer-workspace-filters">
        <label className="trainer-workspace-search">Поиск по пользователю или шагу
          <input type="search" value={query} placeholder="Имя, ID или название шага…"
            onChange={event => { setQuery(event.target.value); resetPage(); }} />
        </label>
        <label>Статус
          <select value={status} onChange={event => { setStatus(event.target.value); resetPage(); }}>
            <option value="ALL">Все статусы</option>
            {statuses.map(value => <option key={value} value={value}>{readableStatus(value)}</option>)}
          </select>
        </label>
        <label>Сортировка
          <select value={sort} onChange={event => {
            setSort(event.target.value as typeof sort); resetPage();
          }}>
            <option value="activity">Последняя активность</option>
            <option value="progress">По прогрессу</option>
            <option value="name">По имени</option>
          </select>
        </label>
      </div>
      <div className="trainer-workspace-count">
        Найдено: {filtered.length} из {data.users.length}
        {(query || status !== "ALL") && <button type="button" onClick={() => {
          setQuery(""); setStatus("ALL"); resetPage();
        }}>Очистить фильтры</button>}
      </div>
      {filtered.length === 0 ? <p role="status" className="trainer-workspace-empty">
        {data.users.length === 0 ? "Этот день ещё никто не открывал" :
          "По запросу ничего не найдено"}</p> : <>
        <div className="trainer-workspace-table-scroll">
          <table><thead><tr><th scope="col">Пользователь</th>
            <th scope="col">Статус</th><th scope="col">Прогресс</th>
            <th scope="col">Текущий шаг</th><th scope="col">Последняя активность</th>
          </tr></thead><tbody>{users.map(user => {
            const progress = user.totalSteps > 0 ?
              Math.min(100, Math.round(user.completedSteps / user.totalSteps * 100)) : 0;
            return <tr key={user.userId}>
              <td><details><summary>{user.username}</summary>
                <ol className="trainer-workspace-step-details">
                  {user.steps.map(step => <li key={step.bundleStepId}>
                    {step.title} — {readableStatus(step.status)}
                  </li>)}
                </ol></details></td>
              <td><span className="trainer-workspace-status">{readableStatus(user.status)}</span></td>
              <td><div className="trainer-workspace-progress">
                <span>{user.completedSteps}/{user.totalSteps} · {progress}%</span>
                <progress value={progress} max={100} aria-label={`Прогресс ${user.username}`} />
              </div></td>
              <td>{user.currentStepTitle ?? "Не выбран"}</td>
              <td><time dateTime={user.lastActivityAt}>{readable(user.lastActivityAt)}</time></td>
            </tr>;
          })}</tbody></table>
        </div>
        <footer className="trainer-workspace-pages">
          <span>Страница {active + 1} из {maxPages}</span>
          <button type="button" disabled={active === 0}
            onClick={() => setPage(active - 1)}>Назад</button>
          <button type="button" disabled={active + 1 >= maxPages}
            onClick={() => setPage(active + 1)}>Далее</button>
        </footer>
      </>}
    </div>
  </section>;
}
