import { useState } from "react";
import { shift, type Schedule } from "./tr014ScheduleRangeRead20261022";
import { matchesCatalogSearch } from "./live/trainerCatalogSearch";

const readableDate = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "short", weekday: "short", timeZone: "UTC",
}).format(new Date(`${value}T00:00:00.000Z`));
export function TrainerDailyCalendarGrid({ from, rows, onEditDate }: {
  from: string; rows: Schedule[];
  onEditDate?: (date: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<"all" | "published" | "draft" | "empty">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const dates = Array.from({ length: 30 }, (_, index) => shift(from, index));
  const byDate = new Map(rows.map(row => [row.date, row]));
  const filtered = dates.filter(day => {
    const schedule = byDate.get(day);
    if (visibility === "published" && !schedule?.isPublished) return false;
    if (visibility === "draft" && (!schedule || schedule.isPublished)) return false;
    if (visibility === "empty" && schedule) return false;
    if (!query.trim()) return true;
    return matchesCatalogSearch(query, [day, schedule?.bundle.title,
      schedule?.bundle.type, schedule?.createdBy.username]);
  });
  const current = selected ? byDate.get(selected) : null;
  return <section className="trainer-workspace-panel trainer-workspace-calendar"
    aria-label="Календарное расписание курса дня">
    <div className="trainer-workspace-calendar-summary">
      <div><span>Запланировано</span><strong>{rows.length}</strong></div>
      <div><span>Опубликовано</span><strong>{rows.filter(row => row.isPublished).length}</strong></div>
      <div><span>Черновиков</span><strong>{rows.filter(row => !row.isPublished).length}</strong></div>
      <div><span>Свободных дат</span><strong>{30 - rows.length}</strong></div>
    </div>
    <div className="trainer-workspace-filters">
      <label className="trainer-workspace-search">Поиск по связке или дате
        <input type="search" value={query} placeholder="Название связки, автор или дата…"
          onChange={event => setQuery(event.target.value)} />
      </label>
      <label>Отображение
        <select value={visibility} onChange={event =>
          setVisibility(event.target.value as typeof visibility)}>
          <option value="all">Все даты</option><option value="published">Опубликованные</option>
          <option value="draft">Черновики</option><option value="empty">Без назначения</option>
        </select>
      </label>
    </div>
    <p className="trainer-workspace-count">Показано дней: {filtered.length} из 30</p>
    <ul aria-label="Календарное расписание" className="trainer-workspace-calendar-grid">
      {filtered.map(date => {
        const entry = byDate.get(date);
        return <li key={date}>
          <button type="button" aria-pressed={selected === date}
            className={"trainer-workspace-calendar-day " +
              (entry ? entry.isPublished ? "is-published" : "is-draft" : "is-empty")}
            onClick={() => setSelected(selected === date ? null : date)}>
            <time dateTime={date}>{readableDate(date)}</time>
            {entry ? <><strong>{entry.bundle.title}</strong>
              <small>{entry.isPublished ? "Опубликовано" : "Черновик"}
                {" · "}{entry.bundle.stepsCount} шагов</small></>
              : <span>Свободный день</span>}
          </button>
        </li>;
      })}
    </ul>
    {filtered.length === 0 && <p role="status" className="trainer-workspace-empty">
      Нет дат по выбранным фильтрам.</p>}
    {selected && <div className="trainer-workspace-calendar-selected" aria-label="Выбранный день">
      <h3>{readableDate(selected)}</h3>
      {current ? <><p><strong>{current.bundle.title}</strong></p>
        <p>Статус: {current.isPublished ? "Опубликовано" : "Черновик"} ·
          {" "}{current.bundle.stepsCount} шагов</p>
        <p>Назначил: {current.createdBy.username}</p></>
        : <p>На эту дату ничего не назначено.</p>}
      {onEditDate && <a className="trainer-workspace-edit-link"
        href="#daily-schedule-editor" onClick={() => onEditDate(selected)}>
        {current ? "Изменить назначение" : "Назначить тренировку"}</a>}
      <button type="button" onClick={() => setSelected(null)}>Закрыть подробности</button>
    </div>}
  </section>;
}
