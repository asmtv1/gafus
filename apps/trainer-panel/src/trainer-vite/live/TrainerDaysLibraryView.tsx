import { useState } from "react";
import type { PanelActor } from "../consultationContract";
import type { VisibleDay, VisibleDaysTransport } from "../trainerVisibleDaysRead20261022";
import { readVisibleDays } from "../trainerVisibleDaysRead20261022";
import type { TrainerContentWriteTransport } from "../TrainerContentEditorRoute";
import {
  matchesCatalogSearch, sortCatalogRows, clampCatalogPage,
  catalogPlainPreview, type CatalogSort,
} from "./trainerCatalogSearch";

const courseNames = (row: VisibleDay) => [...new Map(row.dayLinks
  .map(link => [link.course.id, link.course.name])).values()];
const stepNames = (row: VisibleDay) => row.stepLinks.map(link => link.step.title);
const nameType = (value: string) => ({
  regular: "Тренировочный", introduction: "Введение", instructions: "Инструкции",
  diagnostics: "Диагностика", summary: "Итоги",
} as Record<string, string>)[value] ?? value;
const privateCache = (headers: Record<string, string>) => {
  const flags = (headers["cache-control"] ?? "").toLowerCase().split(",").map(v => v.trim());
  return flags.includes("private") && flags.includes("no-store") && !flags.includes("public");
};
export function TrainerDaysLibraryView(p: {
  actor: PanelActor; rows: VisibleDay[]; search: string; onSearch: (q: string) => void;
  selected: string | null; onSelect: (id: string | null) => void;
  showEditorLinks?: boolean; write?: TrainerContentWriteTransport;
  transport: VisibleDaysTransport; isCurrent: () => boolean;
  onRefresh: () => void;
}) {
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [linkFilter, setLinkFilter] = useState("ALL");
  const [sort, setSort] = useState<CatalogSort>("newest");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const canManage = p.showEditorLinks && !!p.write &&
    (p.actor.role === "TRAINER" || p.actor.role === "ADMIN");
  const choices = [...new Set(p.rows.map(row => row.type))].sort();
  const matches = p.rows.filter(row =>
    (typeFilter === "ALL" || row.type === typeFilter) &&
    (linkFilter === "ALL" || (linkFilter === "ORPHAN" ? !row.dayLinks.length :
      !!row.dayLinks.length)) &&
    matchesCatalogSearch(p.search, [row.title, row.id, ...stepNames(row), ...courseNames(row)]));
  const sorted = sortCatalogRows(matches, sort, row => row.dayLinks.length);
  const activePage = clampCatalogPage(page, sorted.length, perPage);
  const shown = sorted.slice(activePage * perPage, (activePage + 1) * perPage);
  const day = matches.find(row => row.id === p.selected);
  const allChecked = shown.length > 0 && shown.every(row => checked.includes(row.id));
  const changeSearch = (value: string) => { p.onSearch(value); setPage(0); setChecked([]); };
  const toggle = (id: string) => setChecked(old => old.includes(id)
    ? old.filter(value => value !== id) : [...old, id]);
  const togglePage = () => setChecked(old => allChecked
    ? old.filter(id => !shown.some(row => row.id === id))
    : [...new Set([...old, ...shown.map(row => row.id)])]);
  async function remove(ids: string[]) {
    if (!canManage || !p.write || !p.isCurrent() || busy || !ids.length ||
      !ids.every(id => p.rows.some(row => row.id === id))) return;
    const related = p.rows.filter(row => ids.includes(row.id))
      .reduce((count, row) => count + row.dayLinks.length, 0);
    if (!window.confirm(`Удалить дни (${ids.length})?` +
      (related ? ` Задействовано связей с курсами: ${related}.` : "") +
      " Это необратимо.")) return;
    const controller = new AbortController();
    setBusy(true); setNotice("");
    try {
      const result = await p.write({
        method: "DELETE", signal: controller.signal,
        path: ids.length === 1 ? "/api/v1/trainer/days/manage/" + encodeURIComponent(ids[0]!)
          : "/api/v1/trainer/days/manage/batch",
        ...(ids.length === 1 ? {} : { body: { dayIds: ids } }),
      });
      if (!p.isCurrent()) return;
      if (result.status !== 200 || !privateCache(result.headers) || !result.body ||
          typeof result.body !== "object" || !("success" in result.body) ||
          result.body.success !== true) throw Error("DELETE_NOT_CONFIRMED");
      const fresh = await readVisibleDays({ actorId: p.actor.id,
        role: p.actor.role as "TRAINER" | "ADMIN" | "MODERATOR",
        transport: p.transport, signal: controller.signal, isCurrent: p.isCurrent });
      if (!p.isCurrent()) return;
      if (ids.some(id => fresh.some(row => row.id === id))) throw Error("DELETE_READBACK_FAILED");
      p.onSelect(null); setChecked([]); setPage(0);
      setNotice("Удаление подтверждено сервером.");
      p.onRefresh();
    } catch {
      if (p.isCurrent()) setNotice("Удаление не подтверждено. Обновите список перед повтором.");
    } finally { if (p.isCurrent()) setBusy(false); }
  }
  return <section className="trainer-catalog-surface" aria-label="Выбор тренировочного дня"
    data-readonly="true" data-trainer-days-library>
    <div className="trainer-catalog-stats">
      <div><small>Всего дней</small><strong>{p.rows.length}</strong></div>
      <div><small>В составе курсов</small><strong>{p.rows.filter(row => row.dayLinks.length > 0).length}</strong></div>
      <div><small>Без привязки</small><strong>{p.rows.filter(row => !row.dayLinks.length).length}</strong></div>
    </div>
    <div className="trainer-catalog-tools">
      <label className="trainer-catalog-search">Поиск дня по названию
        <input aria-label="Поиск дня по названию" type="search" value={p.search}
          placeholder="Название, шаг, курс или ID…"
          onInput={e => changeSearch(e.currentTarget.value)} /></label>
      <label>Тип дня<select aria-label="Тип дня" value={typeFilter}
        onChange={e => { setTypeFilter(e.currentTarget.value); setPage(0); }}>
        <option value="ALL">Все типы</option>
        {choices.map(value => <option key={value} value={value}>{nameType(value)}</option>)}
      </select></label>
      <label>Связи<select aria-label="Связи дня" value={linkFilter}
        onChange={e => { setLinkFilter(e.currentTarget.value); setPage(0); }}>
        <option value="ALL">Все дни</option><option value="ORPHAN">Без курса</option>
        <option value="IN_COURSE">В составе курса</option>
      </select></label>
      <label>Сортировка<select aria-label="Сортировка дней" value={sort}
        onChange={e => { setSort(e.currentTarget.value as CatalogSort); setPage(0); }}>
        <option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option>
        <option value="recentlyEdited">Недавно изменённые</option>
        <option value="title">По названию</option><option value="relations">По количеству курсов</option>
      </select></label>
    </div>
    <div className="trainer-catalog-results">
      <p>Загружено дней: {p.rows.length}; показано: {shown.length}
        <span> · Найдено: {matches.length}</span></p>
      {(p.search || typeFilter !== "ALL" || linkFilter !== "ALL") && <button type="button"
        className="trainer-catalog-reset" onClick={() => {
          changeSearch(""); setTypeFilter("ALL"); setLinkFilter("ALL");
        }}>Очистить поиск</button>}
    </div>
    {notice && <p className="trainer-catalog-notice" role="status">{notice}</p>}
    {p.rows.length === 0 ? <p className="trainer-catalog-empty" role="status">Дней нет</p> :
      matches.length === 0 ? <p className="trainer-catalog-empty" role="status">
        По запросу ничего не найдено</p> : <>
        <div className="trainer-catalog-actions-bar">
          {canManage && <label className="trainer-catalog-checkall">
            <input type="checkbox" checked={allChecked} onChange={togglePage} />
            Выбрать на странице</label>}
          <span>{checked.length > 0 ? `Выбрано: ${checked.length}` : "Управление тренировочными днями"}</span>
          {canManage && checked.length > 0 && <button type="button"
            className="trainer-catalog-delete" disabled={busy}
            onClick={() => void remove([...checked])}>Удалить выбранные</button>}
        </div>
        <div className="trainer-catalog-column-head" aria-hidden="true">
          <span>Тренировочный день</span><span>Тип</span><span>Шаги</span>
          <span>Курсы</span><span>Создан</span><span>Действия</span>
        </div>
      </>}
    <ul className="trainer-catalog-list" aria-label="Список тренировочных дней">
      {shown.map(row => {
        const canEdit = p.showEditorLinks && (p.actor.role === "ADMIN" ||
          (p.actor.role === "TRAINER" && row.authorId === p.actor.id));
        return <li key={row.id} className="trainer-catalog-item">
          <button type="button" className="trainer-catalog-day-title"
            aria-pressed={row.id === p.selected}
            onClick={() => p.onSelect(row.id)}>{row.title}</button>
          {canManage && <label className="trainer-catalog-check"
            aria-label={"Выбрать день: " + row.title}>
            <input type="checkbox" checked={checked.includes(row.id)} onChange={() => toggle(row.id)} />
          </label>}
          <span className="trainer-catalog-type" data-label="Тип">{nameType(row.type)}</span>
          <span className="trainer-catalog-fact" data-label="Шаги">{row.stepLinks.length} шагов</span>
          <span className="trainer-catalog-fact" data-label="Курсы">
            {courseNames(row).length} курс.</span>
          <time className="trainer-catalog-date" dateTime={row.createdAt} data-label="Создан">
            {new Date(row.createdAt).toLocaleDateString("ru-RU")}</time>
          <div className="trainer-catalog-item-actions">
            {canEdit && <a href={"/days/" + encodeURIComponent(row.id) + "/edit"}>Редактировать</a>}
            {canEdit && canManage && <button type="button" disabled={busy}
              aria-label={"Удалить день: " + row.title}
              onClick={() => void remove([row.id])}>Удалить</button>}
          </div>
          <small className="trainer-catalog-day-description">{catalogPlainPreview(row.description)}</small>
        </li>;
      })}
    </ul>
    {matches.length > 0 && <footer className="trainer-catalog-pager">
      <label>На странице<select aria-label="Дней на странице" value={perPage}
        onChange={e => { setPerPage(Number(e.currentTarget.value)); setPage(0); }}>
        {[10, 25, 50].map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <span>Страница {activePage + 1} из {Math.max(1, Math.ceil(matches.length / perPage))}</span>
      <button type="button" disabled={activePage === 0}
        onClick={() => setPage(activePage - 1)}>Назад</button>
      <button type="button" disabled={(activePage + 1) * perPage >= matches.length}
        onClick={() => setPage(activePage + 1)}>Далее</button>
    </footer>}
    {day && <article className="trainer-catalog-day-detail" aria-label="Подробности выбранного дня">
      <div className="trainer-catalog-detail-title"><h3>{day.title}</h3>
        <button type="button" aria-label="Закрыть подробности дня"
          onClick={() => p.onSelect(null)}>×</button></div>
      <p>{day.description}</p>
      <p>Тип: {day.type.trim() || "Не указано"}</p>
      <p>Оборудование: {day.equipment.trim() || "Не указано"}</p>
      <h4>Шаги ({day.stepLinks.length})</h4>
      <ol>{day.stepLinks.map(link => <li key={link.id}>{link.step.title}</li>)}</ol>
      <h4>Курсы ({courseNames(day).length})</h4>
      <ol>{day.dayLinks.map(link => <li key={link.id}>{link.course.name}</li>)}</ol>
      {p.showEditorLinks && (p.actor.role === "ADMIN" ||
        (p.actor.role === "TRAINER" && day.authorId === p.actor.id)) &&
        <a className="trainer-catalog-edit-link" href={"/days/" + encodeURIComponent(day.id) +
          "/edit"}>Редактировать день</a>}
    </article>}
  </section>;
}
