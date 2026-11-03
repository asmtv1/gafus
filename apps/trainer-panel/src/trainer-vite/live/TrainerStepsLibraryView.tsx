import { useState } from "react";
import type { PanelActor } from "../consultationContract";
import { readVisibleSteps, type VisibleStepDto } from "../tr013VisibleStepsRead20261022";
import type { TrainerContentWriteTransport } from "../TrainerContentEditorRoute";
import type { VisibleStepTransport } from "../TrainerVisibleStepsOptInRoute";
import { matchesCatalogSearch, sortCatalogRows, clampCatalogPage,
  catalogPlainPreview, type CatalogSort } from "./trainerCatalogSearch";

const names: Record<string, string> = {
  TRAINING: "Практика", THEORY: "Теория", EXAMINATION: "Экзамен",
  BREAK: "Перерыв", DIARY: "Дневник", SURVEY: "Опрос", PRACTICE: "Упражнение",
};
const dayNames = (row: VisibleStepDto) => [...new Set(row.stepLinks
  .map(link => link.day.title).filter((x): x is string => !!x))];
const courseNames = (row: VisibleStepDto) => {
  const first = new Map<string, string>();
  for (const link of row.stepLinks) for (const { course } of link.day.dayLinks)
    if (!first.has(course.id)) first.set(course.id, course.name);
  return [...first.values()];
};
const cacheSafe = (headers: Record<string, string>) => {
  const flags = (headers["cache-control"] ?? "").toLowerCase().split(",").map(s => s.trim());
  return flags.includes("private") && flags.includes("no-store") && !flags.includes("public");
};
export function TrainerStepsLibraryView(p: {
  rows: VisibleStepDto[]; actor: PanelActor; query: string;
  onQuery: (q: string) => void; isDaily: boolean; dailyPath: boolean;
  onDaily: (value: boolean) => void;
  search?: string;
  canEdit: boolean;
  write?: TrainerContentWriteTransport;
  transport: VisibleStepTransport;
  current: () => boolean;
  onRefresh: (rows?: VisibleStepDto[]) => void;
}) {
  const params = new URLSearchParams(p.search ?? "");
  const initialSize = Number(params.get("rowsPerPage"));
  const [perPage, setPerPage] = useState([5, 10, 25, 50].includes(initialSize) ? initialSize : 10);
  const [page, setPage] = useState(Math.max(0, Number(params.get("page")) || 0));
  const [sort, setSort] = useState<CatalogSort>(params.get("orderBy") === "title" ? "title"
    : params.get("order") === "asc" ? "oldest" : "newest");
  const [type, setType] = useState("ALL");
  const [relation, setRelation] = useState(params.get("onlyOrphanSteps") === "true" ||
    params.get("onlyOrphanSteps") === "1" ? "ORPHAN" : "ALL");
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const queryChange = (value: string) => { p.onQuery(value); setPage(0); setChecked([]); };
  const choices = [...new Set(p.rows.map(row => row.type))].sort();
  const filtered = p.rows.filter(row =>
    (type === "ALL" || row.type === type) &&
    (relation === "ALL" || (relation === "ORPHAN" ? !row.stepLinks.length : !!row.stepLinks.length)) &&
    matchesCatalogSearch(p.query, [row.title, row.id, ...dayNames(row), ...courseNames(row)]));
  const sorted = sortCatalogRows(filtered, sort, row => row.stepLinks.length);
  const activePage = clampCatalogPage(page, sorted.length, perPage);
  const shown = sorted.slice(activePage * perPage, (activePage + 1) * perPage);
  const selected = sorted.filter(row => checked.includes(row.id));
  const allOnPage = shown.length > 0 && shown.every(row => checked.includes(row.id));
  const canManage = p.canEdit && !!p.write && p.actor.role !== "MODERATOR";
  const toggle = (id: string) => setChecked(prev => prev.includes(id)
    ? prev.filter(value => value !== id) : [...prev, id]);
  const togglePage = () => setChecked(prev => allOnPage
    ? prev.filter(id => !shown.some(row => row.id === id))
    : [...new Set([...prev, ...shown.map(row => row.id)])]);
  async function deleteIds(ids: string[]) {
    if (!canManage || !p.write || !p.current() || busy || !ids.length ||
        !ids.every(id => p.rows.some(row => row.id === id))) return;
    const related = p.rows.filter(row => ids.includes(row.id))
      .reduce((count, row) => count + row.stepLinks.length, 0);
    if (!window.confirm(`Удалить шаги (${ids.length})?` +
      (related ? ` Задействовано связей с днями: ${related}.` : "") +
      " Это необратимо.")) return;
    const ctl = new AbortController();
    setBusy(true); setNotice("");
    try {
      const res = await p.write({ method: "DELETE",
        path: ids.length === 1 ? "/api/v1/trainer/steps/manage/" + encodeURIComponent(ids[0]!)
          : "/api/v1/trainer/steps/manage/batch", signal: ctl.signal,
        ...(ids.length === 1 ? {} : { body: { stepIds: ids } }),
      });
      if (!p.current()) return;
      if (res.status !== 200 || !cacheSafe(res.headers) ||
          !res.body || typeof res.body !== "object" ||
          !("success" in res.body) || res.body.success !== true) throw Error("DELETE_FAILED");
      const fresh = await readVisibleSteps({
        enabled: true, actor: { id: p.actor.id, role: p.actor.role },
        isDailyCourse: p.isDaily, signal: ctl.signal,
        isCurrent: p.current, transport: p.transport,
      });
      if (!p.current() || ctl.signal.aborted) return;
      if (ids.some(id => fresh.some(item => item.id === id)))
        throw Error("DELETE_READBACK_FAILED");
      setChecked([]); setPage(0); setNotice("Удаление подтверждено сервером.");
      p.onRefresh();
    } catch {
      if (p.current()) setNotice("Удаление не подтверждено. Обновите список перед повтором.");
    } finally { if (p.current()) setBusy(false); }
  }
  const dayUrl = "/days/new?" + new URLSearchParams(
    selected.map(row => ["stepIds", row.id]),
  ).toString();
  return <div className="trainer-catalog-surface" data-trainer-steps-list>
    <div className="trainer-catalog-stats">
      <div><small>Всего шагов</small><strong>{p.rows.length}</strong></div>
      <div><small>В тренировочных днях</small>
        <strong>{p.rows.filter(row => row.stepLinks.length > 0).length}</strong></div>
      <div><small>Без привязки</small>
        <strong>{p.rows.filter(row => row.stepLinks.length === 0).length}</strong></div>
    </div>
    <div className="trainer-catalog-tools">
      {!p.dailyPath && <label>Тип шагов<select aria-label="Тип шагов"
        value={p.isDaily ? "daily" : "regular"}
        onChange={e => { p.onDaily(e.currentTarget.value === "daily"); setPage(0); setChecked([]); }}>
        <option value="regular">Обычные</option><option value="daily">Курс дня</option>
      </select></label>}
      <label className="trainer-catalog-search">Поиск шага по названию
        <input type="search" aria-label="Поиск шага по названию" value={p.query}
          placeholder="Название, связанный день, курс или ID…"
          onInput={e => queryChange(e.currentTarget.value)} /></label>
      <label>Формат<select aria-label="Формат шага" value={type}
        onChange={e => { setType(e.currentTarget.value); setPage(0); }}>
        <option value="ALL">Все форматы</option>
        {choices.map(value => <option key={value} value={value}>{names[value] ?? value}</option>)}
      </select></label>
      <label>Связи<select aria-label="Связи шага" value={relation}
        onChange={e => { setRelation(e.currentTarget.value); setPage(0); }}>
        <option value="ALL">Все шаги</option>
        <option value="ORPHAN">Без дня</option><option value="IN_DAY">В составе дня</option>
      </select></label>
      <label>Сортировка<select aria-label="Сортировка шагов" value={sort}
        onChange={e => { setSort(e.currentTarget.value as CatalogSort); setPage(0); }}>
        <option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option>
        <option value="recentlyEdited">Недавно изменённые</option>
        <option value="title">По названию</option><option value="relations">По количеству связей</option>
      </select></label>
    </div>
    {p.dailyPath && <p className="trainer-catalog-hint">
      Шаги, созданные с включённой галочкой «Курс дня»</p>}
    <div className="trainer-catalog-results">
      <p>Загружено шагов: {p.rows.length}; показано: {shown.length}
        <span> · Найдено: {filtered.length}</span></p>
      {(p.query || type !== "ALL" || relation !== "ALL") && <button type="button"
        className="trainer-catalog-reset" onClick={() => {
          queryChange(""); setType("ALL"); setRelation("ALL");
        }}>Очистить поиск</button>}
    </div>
    {notice && <p className="trainer-catalog-notice" role="status">{notice}</p>}
    {p.rows.length === 0 ? <p className="trainer-catalog-empty" role="status">Шагов пока нет</p> :
      filtered.length === 0 ? <p className="trainer-catalog-empty" role="status">
        По запросу ничего не найдено</p> : <>
        <div className="trainer-catalog-actions-bar">
          {canManage && <label className="trainer-catalog-checkall">
            <input type="checkbox" checked={allOnPage} onChange={togglePage} />
            Выбрать на странице</label>}
          <span>{checked.length ? `Выбрано: ${checked.length}` : "Управление шагами"}</span>
          {canManage && !p.dailyPath && checked.length > 0 &&
            <a className="trainer-catalog-derived" href={dayUrl}>
            Создать день из выбранных ({selected.length})</a>}
          {canManage && checked.length > 0 && <button type="button"
            className="trainer-catalog-delete" disabled={busy}
            onClick={() => void deleteIds([...checked])}>Удалить выбранные</button>}
        </div>
        <div className="trainer-catalog-column-head" aria-hidden="true">
          <span>Название и описание</span><span>Формат</span><span>Длительность</span>
          <span>Привязки</span><span>Создан</span><span>Действия</span>
        </div>
        <ul className="trainer-catalog-list" aria-label="Список шагов">
          {shown.map(row => {
            const courses = courseNames(row);
            const days = dayNames(row);
            const canEdit = p.canEdit && (p.actor.role === "ADMIN" ||
              (p.actor.role === "TRAINER" && row.authorId === p.actor.id));
            return <li key={row.id} className="trainer-catalog-item">
              {canManage && <label className="trainer-catalog-check"
                aria-label={"Выбрать шаг: " + row.title}>
                <input type="checkbox" checked={checked.includes(row.id)} onChange={() => toggle(row.id)} />
              </label>}
              <details className="trainer-catalog-item-content">
                <summary>{row.title} — {row.author.username}</summary>
                <small className="trainer-catalog-item-description">{catalogPlainPreview(row.description) || "Без описания"}</small>
                <dl className="trainer-catalog-detail-grid">
                  <dt>Описание</dt><dd>{row.description || "Не указано"}</dd>
                  <dt>Тип</dt><dd>{row.type}</dd>
                  <dt>Продолжительность</dt>
                  <dd>{row.durationSec === null ? "Не указано" : `${row.durationSec} секунд`}</dd>
                  <dt>Оценочная продолжительность</dt>
                  <dd>{row.estimatedDurationSec === null ? "Не указано" :
                    `${row.estimatedDurationSec} секунд`}</dd>
                  <dt>Курс дня</dt><dd>{row.isDailyCourse ? "Да" : "Нет"}</dd>
                </dl>
                <h3>Связанные курсы</h3>
                {courses.length === 0 ? <p>Нет связанных курсов</p> :
                  <ul aria-label="Связанные курсы">{courses.map(name => <li key={name}>{name}</li>)}</ul>}
                {days.length > 0 && <p>Дни: {days.join(", ")}</p>}
                {canEdit && <a href={"/steps/" + encodeURIComponent(row.id) + "/edit"}>
                  Редактировать шаг</a>}
              </details>
              <span className="trainer-catalog-type" data-label="Формат">{names[row.type] ?? row.type}</span>
              <span className="trainer-catalog-fact" data-label="Длительность">
                {row.durationSec === null ? "—" : `${row.durationSec} с`}</span>
              <span className="trainer-catalog-fact" data-label="Привязки">
                {row.stepLinks.length} дн. · {courses.length} курс.</span>
              <time className="trainer-catalog-date" dateTime={row.createdAt} data-label="Создан">
                {new Date(row.createdAt).toLocaleDateString("ru-RU")}</time>
              <div className="trainer-catalog-item-actions">
                {canEdit && <a href={"/steps/" + encodeURIComponent(row.id) + "/edit"}>
                  Редактировать</a>}
                {canEdit && canManage && <button type="button" disabled={busy}
                  aria-label={"Удалить шаг: " + row.title} onClick={() => void deleteIds([row.id])}>
                  Удалить</button>}
              </div>
            </li>;
          })}
        </ul>
        <footer className="trainer-catalog-pager">
          <label>На странице<select aria-label="Шагов на странице" value={perPage}
            onChange={e => { setPerPage(Number(e.currentTarget.value)); setPage(0); }}>
            {[5, 10, 25, 50].map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <span>Страница {activePage + 1} из {Math.max(1, Math.ceil(filtered.length / perPage))}</span>
          <button type="button" disabled={activePage === 0}
            onClick={() => setPage(activePage - 1)}>Назад</button>
          <button type="button" disabled={(activePage + 1) * perPage >= filtered.length}
            onClick={() => setPage(activePage + 1)}>Далее</button>
        </footer>
      </>}
  </div>;
}
