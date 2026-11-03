import { useMemo, useState } from "react";
import type { CourseStatistics, StatisticsKind, StepStatistics,
  TrainerStatisticsDto } from "./trainerStatisticsProposedConsumer";
import { matchesCatalogSearch } from "./live/trainerCatalogSearch";

const levelNames: Record<string, string> = {
  BEGINNER: "Начальный", INTERMEDIATE: "Средний", ADVANCED: "Продвинутый",
  EXPERT: "Экспертный",
};
export function TrainerStatisticsContent({ kind, data }: {
  kind: StatisticsKind; data: TrainerStatisticsDto;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const [access, setAccess] = useState("ALL");
  const courses = kind === "courses" ? data as CourseStatistics : null;
  const steps = kind === "steps" ? data as StepStatistics : null;
  const results = useMemo(() => {
    if (courses) return courses.courses.filter(row =>
      (access === "ALL" || (access === "paid" ? row.isPaid :
        access === "private" ? row.isPrivate && !row.isPaid :
          !row.isPrivate && !row.isPaid)) &&
      matchesCatalogSearch(query, [row.name, row.id, row.author?.username]),
    ).sort((a, b) => sort === "participants" ? b.totalUsers - a.totalUsers :
      sort === "completion" ?
        (b.totalUsers ? b.completedUsers / b.totalUsers : 0) -
        (a.totalUsers ? a.completedUsers / a.totalUsers : 0) :
        a.name.localeCompare(b.name, "ru"));
    return (steps?.steps ?? []).filter(row =>
      matchesCatalogSearch(query, [row.title, row.id]),
    ).sort((a, b) => sort === "relations" ? b.usedInDaysCount - a.usedInDaysCount :
      a.title.localeCompare(b.title, "ru"));
  }, [courses, steps, query, access, sort]);
  const maxPages = Math.max(1, Math.ceil(results.length / 20));
  const active = Math.min(page, maxPages - 1);
  const paged = results.slice(active * 20, active * 20 + 20);
  const totalStarted = courses?.courses.reduce((sum, course) => sum +
    course.inProgressUsers + course.completedUsers, 0) ?? 0;
  const totalCompleted = courses?.courses.reduce((sum, course) => sum + course.completedUsers, 0) ?? 0;
  return <section className="trainer-workspace-statistics-collection"
    aria-label={courses ? "Статистика курсов" : "Статистика шагов"}>
    {courses && <p className="trainer-workspace-count">Курсов: {courses.totalCourses} ·
      Дней тренировок: {courses.totalDays} ·
      Активность: {courses.totalCourses > 0 ? Math.round(courses.totalDays /
        courses.totalCourses * 10) / 10 : 0} дней/курс</p>}
    {courses ? <div className="trainer-workspace-kpis">
      <div><span>Курсов</span><strong>{courses.totalCourses}</strong></div>
      <div><span>Дней тренировок</span><strong>{courses.totalDays}</strong></div>
      <div><span>Начали обучение</span><strong>{totalStarted}</strong>
        <small>Суммарно по курсам</small></div>
      <div><span>Завершили</span><strong>{totalCompleted}</strong>
        <small>Суммарно по курсам</small></div>
    </div> : <div className="trainer-workspace-kpis trainer-workspace-kpis-small">
      <div><span>Шагов</span><strong>{steps?.totalSteps ?? 0}</strong></div>
      <div><span>Дней с использованием</span><strong>{steps?.steps.reduce((a, b) =>
        a + b.usedInDaysCount, 0) ?? 0}</strong></div>
    </div>}
    <div className="trainer-workspace-panel">
      <header><h2>{courses ? "Результаты курсов" : "Использование шагов"}</h2>
        <p>{courses ? "Участники, завершения и конверсия в обучение" :
          "Сколько раз шаги включены в тренировочные дни и курсы"}</p>
      </header>
      <div className="trainer-workspace-filters">
        <label className="trainer-workspace-search">Поиск по названию
          <input type="search" value={query} placeholder="Название или ID…"
            onChange={event => { setQuery(event.target.value); setPage(0); }} />
        </label>
        {courses && <label>Доступ
          <select value={access} onChange={event => {
            setAccess(event.target.value); setPage(0);
          }}><option value="ALL">Все курсы</option><option value="public">Публичные</option>
            <option value="private">Приватные</option><option value="paid">По подписке</option>
          </select></label>}
        <label>Сортировка
          <select value={sort} onChange={event => { setSort(event.target.value); setPage(0); }}>
            <option value="name">По названию</option>
            {courses ? <><option value="participants">По участникам</option>
              <option value="completion">По завершению</option></> :
              <option value="relations">По количеству дней</option>}
          </select>
        </label>
      </div>
      <p className="trainer-workspace-count">Найдено: {results.length}
        {query && <button type="button" onClick={() => { setQuery(""); setPage(0); }}>
          Очистить поиск</button>}
      </p>
      {results.length === 0 ? <p className="trainer-workspace-empty" role="status">
        {query || access !== "ALL" ? "По запросу ничего не найдено" :
          courses ? "Курсы не найдены" : "Шагов пока нет"}</p> :
        <div className="trainer-workspace-table-scroll">
          {courses ? <table><thead><tr><th scope="col">Курс</th>
            <th scope="col">Начали</th><th scope="col">Завершили</th>
            <th scope="col">В процессе</th><th scope="col">Завершение</th>
            <th scope="col">Доступ</th></tr></thead>
            <tbody>{(paged as CourseStatistics["courses"]).map(course => {
              const ratio = course.totalUsers > 0 ? Math.round(course.completedUsers /
                course.totalUsers * 100) : 0;
              return <tr key={course.id}>
                <td><strong>{course.name}</strong><small>{levelNames[course.trainingLevel] ??
                  course.trainingLevel} · {course.avgRating === null ? "Нет оценок" :
                  `рейтинг: ${course.avgRating.toFixed(1)}`}</small></td>
                <td><span>участников: {course.totalUsers}</span></td>
                <td>{course.completedUsers}</td>
                <td>{course.inProgressUsers}</td>
                <td><div className="trainer-workspace-progress"><span>Завершение: {ratio}%</span>
                  <progress value={ratio} max={100} aria-label={`Завершение курса ${course.name}`} />
                </div></td>
                <td>{course.isPaid ? "По подписке" : course.isPrivate ? "Приватный" :
                  "Публичный"}</td>
              </tr>;
            })}</tbody></table> :
            <table><thead><tr><th scope="col">Шаг</th><th scope="col">В днях</th>
              <th scope="col">В курсах</th><th scope="col">Длительность</th></tr></thead>
              <tbody>{(paged as StepStatistics["steps"]).map(step => <tr key={step.id}>
                <td><strong>{step.title}</strong><small>
                  используется в днях: {step.usedInDaysCount}, в курсах: {step.usedInCoursesCount}
                </small></td>
                <td>{step.usedInDaysCount}</td><td>{step.usedInCoursesCount}</td>
                <td>{step.durationSec === null ? "Не указана" : `${step.durationSec} с`}</td>
              </tr>)}</tbody></table>}
        </div>}
      {results.length > 20 && <footer className="trainer-workspace-pages">
        <span>Страница {active + 1} из {maxPages}</span>
        <button type="button" disabled={active === 0} onClick={() => setPage(active - 1)}>
          Назад</button>
        <button type="button" disabled={active + 1 >= maxPages}
          onClick={() => setPage(active + 1)}>Далее</button>
      </footer>}
      {!courses && <p className="trainer-workspace-hint">
        Прогресс пользователей для шагов не рассчитывается.
      </p>}
    </div>
  </section>;
}
