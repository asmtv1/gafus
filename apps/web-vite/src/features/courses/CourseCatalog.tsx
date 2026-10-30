import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton } from "../../shared/ui";
import { useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TrainingStatus } from "@gafus/types";
import "./CourseNextMainGeometry.css";
import { useQuery } from "@tanstack/react-query";
import { listCourses, type CourseCatalogItem } from "./courseApi";
import { ApiError } from "../../shared/api/client";
import { LegacyCourseCard } from "./LegacyCourseCard";
import pageStyles from "../../brand/LegacyCoursesPage.module.css";
import searchStyles from "../../brand/LegacyCourseSearch.module.css";
import filterStyles from "../../brand/LegacyCourseFilters.module.css";
import { DailyCourseOptInHarness } from "../daily-course/DailyCourseOptInHarness";
import type { DailyToday } from "../daily-course/dailyCourseApi";
import type { DailyReadOnlyLoader } from "../daily-course/DailyCoursePanel";
import { RouteLink } from "../../shared/router/location";
import {
  DEFAULT_COURSE_VIEW_FILTERS,
  CourseViewSessionContext,
  readCourseHistoryFilters,
  saveCourseHistoryFilters,
  filterProjectedCourses,
  type CourseTab,
  type CourseLevel,
  type CourseProgress,
  type CourseSort,
  type CourseViewFilters,
} from "./courseCatalogFilters";

export { courseLevelLabel, courseProgressLabel } from "./courseLabels";

type CourseRating = "ALL" | "4+" | "3+" | "ANY";
const ratingChoices: readonly { id: CourseRating; label: string }[] = [
  { id: "ALL", label: "Все курсы" },
  { id: "4+", label: "4+ звезды" },
  { id: "3+", label: "3+ звезды" },
  { id: "ANY", label: "С рейтингом" },
];
function hasVerifiedRating(course: CourseCatalogItem, rating: CourseRating): boolean {
  if (rating === "ALL") return true;
  if (!("avgRating" in course) || typeof course.avgRating !== "number" ||
    !Number.isFinite(course.avgRating)) return false;
  if (rating === "ANY") return true;
  return course.avgRating >= (rating === "4+" ? 4 : 3);
}

// Source Next FiltersDrawer button groups, applied only to already projected rows.
const tabChoices: readonly {id: CourseTab; label:string}[] = [
  {id:"all",label:"Все"},{id:"free",label:"Бесплатные"},
  {id:"paid",label:"Платные"},{id:"private",label:"Приватные"},
];
const levelChoices: readonly {id: CourseLevel; label:string}[] = [
  {id:"ALL",label:"Все уровни"},{id:"BEGINNER",label:"Начальный"},
  {id:"INTERMEDIATE",label:"Средний"},{id:"ADVANCED",label:"Продвинутый"},
  {id:"EXPERT",label:"Экспертный"},
];
// Preserve original Next FiltersDrawer label/icon separation for mobile
// alignment. These symbols are presentation only, never progress authority.
const progressChoices: readonly {id: CourseProgress; label:string; icon:string}[] = [
  {id:"ALL",label:"Все курсы",icon:"📚"},
  {id:TrainingStatus.NOT_STARTED,label:"Не начатые",icon:"⭐"},
  {id:TrainingStatus.IN_PROGRESS,label:"В процессе",icon:"🔥"},
  {id:TrainingStatus.COMPLETED,label:"Завершенные",icon:"✅"},
  {id:TrainingStatus.PAUSED,label:"На паузе",icon:"⏸"},
  {id:TrainingStatus.RESET,label:"Сброшенные",icon:"🔄"},
];

export function CourseCatalog({
  userId,
  favoritesOnly = false,
  showDailyCourseOptIn = false,
  dailyTodayLoader,
  dailyDayLoader,
  dailyRouteMode = false,
}: {
  userId: string | null;
  favoritesOnly?: boolean;
  showDailyCourseOptIn?: boolean;
  dailyTodayLoader?: () => Promise<DailyToday>;
  dailyDayLoader?: DailyReadOnlyLoader;
  dailyRouteMode?: boolean;
}) {
  // Search and filter values belong to the current principal; do not allow
  // the query previously entered by owner A to appear after login B or A-B-A.
  const principalKey = userId ? "owner:" + userId : "unverified";
  const generation = useContext(CourseViewSessionContext);
  const historyScope = { principal: principalKey, generation, favoritesOnly };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<CourseViewFilters | null>(null);
  const [ratingFilter, setRatingFilter] = useState<CourseRating>("ALL");
  const [draftRating, setDraftRating] = useState<CourseRating | null>(null);
  useEffect(() => {
    if (!filtersOpen && !sortOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        setSortOpen(false);
        setDraftFilters(null);
        setDraftRating(null);
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [filtersOpen, sortOpen]);
  useEffect(() => {
    if (!filtersOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [filtersOpen]);
  const [view, setView] = useState<{
    principal: string; generation: string | null; filters: CourseViewFilters;
  }>(() => ({
    principal: principalKey, generation,
    filters: readCourseHistoryFilters(historyScope) ?? { ...DEFAULT_COURSE_VIEW_FILTERS },
  }));
  const filters = view.principal === principalKey && view.generation === generation
    ? view.filters : DEFAULT_COURSE_VIEW_FILTERS;
  useEffect(() => {
    // Never carry a staged filter from owner A into owner B or new session.
    setDraftFilters(null);
    setDraftRating(null);
    setRatingFilter("ALL");
    setFiltersOpen(false);
    setSortOpen(false);
  }, [principalKey, generation]);
  const changeFilters = (change: Partial<CourseViewFilters>) => {
    const next = { ...filters, ...change };
    // The history entry is updated synchronously before a detail navigation.
    saveCourseHistoryFilters(historyScope, next);
    setView({ principal: principalKey, generation, filters: next });
  };
  const hasFilters =
    filters.search !== "" ||
    filters.tab !== "all" ||
    filters.level !== "ALL" ||
    filters.progress !== "ALL" ||
    ratingFilter !== "ALL" ||
    filters.sort !== "server";

  // Query must be isolated per principal to prevent showing another user's
  // access/favorites after switching accounts in the same browser.
  const courses = useQuery({
    queryKey: ["courses", "catalog", userId ?? "unverified"],
    queryFn: () => listCourses(),
    // Even if a caller bypasses App's route guard, no anonymous catalog GET.
    enabled: Boolean(userId),
    staleTime: 0,
    retry: false,
  });
  // Cached access, progress and favorites may belong to a previous server
  // decision. Never publish them while a current-session GET is outstanding.
  const ready = Boolean(userId) && courses.isSuccess && !courses.isFetching;
  const unauthenticated = courses.error instanceof ApiError && courses.error.status === 401;
  const forbidden = courses.error instanceof ApiError && courses.error.status === 403;

  // Only server-returned flags may determine which courses are favorites.
  // Course filters are only mounted for an authenticated principal.
  const base = !ready
    ? []
    : favoritesOnly
      ? courses.data.filter((course) => course.isFavorite)
      : courses.data;
  const visible = filterProjectedCourses(base, filters, userId !== null)
    .filter(course => hasVerifiedRating(course, ratingFilter));
  const previewFilters = draftFilters ?? filters;
  const previewRating = draftRating ?? ratingFilter;
  const previewCount = filterProjectedCourses(base, previewFilters, userId !== null)
    .filter(course => hasVerifiedRating(course, previewRating)).length;
  // Original Next FiltersDrawer compares staged type against its own reset
  // default "free" (not the outer initial tab "all"). This deliberately
  // displays a footer Reset action on the first open of the drawer.
  const canResetSourceDrawer = previewFilters.tab !== "free" ||
    previewFilters.level !== "ALL" || previewFilters.progress !== "ALL" ||
    previewRating !== "ALL";
  const closeFilterDrawer = () => {
    setFiltersOpen(false);
    setDraftFilters(null);
    setDraftRating(null);
  };
  const filterControls = <>
            {filtersOpen && <button type="button"
              className="course-next-filters-backdrop" aria-label="Закрыть панель фильтров"
              onClick={closeFilterDrawer} />}
            <div className={`course-catalog-filters ${filtersOpen
              ? "course-next-filters-drawer" : sortOpen ? "course-next-sort-popover" : ""}`}
              hidden={!filtersOpen && !sortOpen}
              role={filtersOpen ? "dialog" : sortOpen ? "group" : undefined}
              aria-label={filtersOpen ? "Фильтры курсов" : sortOpen ? "Сортировка курсов" : undefined}
              aria-modal={filtersOpen ? "true" : undefined}>
              <span className="course-next-filters-legend">Поиск и фильтры курсов</span>
              {filtersOpen && <div className="course-next-filters-header">
                <h3>Фильтры</h3>
                <button type="button" aria-label="Закрыть"
                  onClick={closeFilterDrawer}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>}
          <div hidden={sortOpen} className="course-next-drawer-content">
            {filtersOpen && <>
              <section className="course-next-drawer-section" aria-label="Тип курса">
                <h4>Тип курса</h4>
                <div className="course-next-drawer-options">
                  {tabChoices.map(({id,label}) =>
                    <button key={id} type="button"
                      className={previewFilters.tab === id ? "course-next-drawer-active" : ""}
                      aria-pressed={previewFilters.tab === id}
                      onClick={() => setDraftFilters({ ...previewFilters, tab: id })}>
                      {label}
                    </button>)}
                </div>
              </section>
              <section className="course-next-drawer-section" aria-label="Уровень сложности">
                <h4>Уровень сложности</h4>
                <div className="course-next-drawer-options">
                  {levelChoices.map(({id,label}) =>
                    <button key={id} type="button"
                      className={previewFilters.level === id ? "course-next-drawer-active" : ""}
                      aria-pressed={previewFilters.level === id}
                      onClick={() => setDraftFilters({ ...previewFilters, level: id })}>
                      {label}
                    </button>)}
                </div>
              </section>
              {userId !== null && <section className="course-next-drawer-section"
                aria-label="Прогресс обучения">
                <h4>Прогресс обучения</h4>
                <div className="course-next-drawer-options">
                  {progressChoices.map(({id,label,icon}) =>
                    <button key={id} type="button"
                      className={previewFilters.progress === id ? "course-next-drawer-active" : ""}
                      aria-pressed={previewFilters.progress === id}
                      onClick={() => setDraftFilters({ ...previewFilters, progress: id })}>
                      <span className="course-next-progress-emoji" aria-hidden="true">{icon}</span>
                      {label}
                    </button>)}
                </div>
              </section>}
              {userId !== null && <section className="course-next-drawer-section"
                aria-label="Рейтинг">
                <h4>Рейтинг</h4>
                <div className="course-next-drawer-options">
                  {ratingChoices.map(({id,label}) =>
                    <button key={id} type="button"
                      className={previewRating === id ? "course-next-drawer-active" : ""}
                      aria-pressed={previewRating === id}
                      onClick={() => setDraftRating(id)}>{label}</button>)}
                </div>
              </section>}
            </>}
            <div className={filtersOpen ? "course-next-drawer-native-selects" : ""}>
            <label htmlFor="course-filter-kind">
            Тип
            <select
              id="course-filter-kind"
              value={filters.tab}
              onChange={(event) => changeFilters({ tab: event.target.value as CourseTab })}
            >
              <option value="all">Все типы</option>
              <option value="free">Бесплатные</option>
              <option value="paid">Платные</option>
              <option value="private">Приватные</option>
            </select>
          </label>
          <label htmlFor="course-filter-level">
            Уровень
            <select
              id="course-filter-level"
              value={filters.level}
              onChange={(event) => changeFilters({ level: event.target.value as CourseLevel })}
            >
              <option value="ALL">Все уровни</option>
              <option value="BEGINNER">Начальный</option>
              <option value="INTERMEDIATE">Средний</option>
              <option value="ADVANCED">Продвинутый</option>
              <option value="EXPERT">Экспертный</option>
            </select>
          </label>
          {userId !== null && (
            <label htmlFor="course-filter-progress">
              Прогресс
              <select
                id="course-filter-progress"
                value={filters.progress}
                onChange={(event) =>
                  changeFilters({ progress: event.target.value as CourseProgress })
                }
              >
                <option value="ALL">Любой прогресс</option>
                <option value="NOT_STARTED">Не начат</option>
                <option value="IN_PROGRESS">В процессе</option>
                <option value="COMPLETED">Пройден</option>
                <option value="PAUSED">Приостановлен</option>
                <option value="RESET">Сброшен</option>
              </select>
            </label>
          )}
            </div>
          </div>
          <div hidden={filtersOpen}><label htmlFor="course-filter-sort">
            Сортировка
            <select
              id="course-filter-sort"
              value={filters.sort}
              onChange={(event) => changeFilters({ sort: event.target.value as CourseSort })}
            >
              <option value="server">Порядок каталога</option>
              <option value="name">По названию</option>
            </select>
          </label>
          </div>
          {hasFilters && !filtersOpen && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                if (filtersOpen) {
                  setDraftFilters({ ...DEFAULT_COURSE_VIEW_FILTERS });
                  setDraftRating("ALL");
                } else {
                  changeFilters({ ...DEFAULT_COURSE_VIEW_FILTERS });
                  setRatingFilter("ALL");
                }
              }}
            >
              Сбросить фильтры
            </button>
          )}
          {filtersOpen && <div className="course-next-filters-footer">
            {canResetSourceDrawer && <button type="button"
              className="course-next-filters-reset"
              onClick={() => {
                // Source handleReset: local draft resets to free, while the
                // parent applied filters reset to all immediately. Preserve
                // both states, including the current owner's history scope.
                setDraftFilters({...DEFAULT_COURSE_VIEW_FILTERS,tab:"free"});
                setDraftRating("ALL");
                changeFilters({...DEFAULT_COURSE_VIEW_FILTERS});
                setRatingFilter("ALL");
              }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                aria-hidden="true">
                <path d="M2 8h12M8 4l-4 4 4 4" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Сбросить
            </button>}
            <PrimaryButton className="course-next-filters-apply" onClick={() => {
              changeFilters(previewFilters);
              setRatingFilter(previewRating);
              closeFilterDrawer();
            }}>
              Показать
              <span className="course-next-results-count" aria-label={`Результатов: ${previewCount}`}>
                {previewCount}
              </span>
            </PrimaryButton>
          </div>}
            </div>
  </>;

  // The root router redirects anonymous principals to the presentation.
  // Keep this component fail-closed when mounted in isolation as well.
  if (!userId) return null;

  return (
    <section aria-label={favoritesOnly ? "Избранные курсы" : "Каталог курсов"} className={`${pageStyles.container} catalog gafus-next-courses`}>
      <header className="catalog-header">
        {favoritesOnly
          ? <h2 className={pageStyles.title}>Избранные курсы</h2>
          : <h1 className={pageStyles.title}>Курсы</h1>}
        {userId && favoritesOnly && <p>
          <BackButtonLink to="/courses">Все курсы</BackButtonLink>
        </p>}
      </header>

      {!favoritesOnly && (
        <DailyCourseOptInHarness
          enabled={showDailyCourseOptIn}
          userId={userId}
          loadToday={dailyTodayLoader}
          loadDay={dailyDayLoader}
          routeMode={dailyRouteMode}
          catalogCard={dailyRouteMode}
        />
      )}
      {courses.isPending && <Loading message="Загружаем курсы…" />}
      {courses.isFetching && courses.data && (
        <Loading variant="compact" message={favoritesOnly ?
          "Проверяем избранные курсы…" : "Обновляем список курсов…"} />
      )}
      {courses.isError && (
        <div role="alert">
          <p>
            {unauthenticated
              ? "Сессия завершена. Войдите снова."
              : forbidden
                ? "Нет доступа к каталогу курсов."
                : "Не удалось загрузить курсы."}
          </p>
          {unauthenticated ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            !forbidden && (
              <button type="button" onClick={() => void courses.refetch()}>
                Повторить
              </button>
            )
          )}
        </div>
      )}
      {ready && (
        <div className="gafus-course-search-filters" data-next-course-search>
          <div className={searchStyles.searchContainer}>
            <div className={searchStyles.searchWrapper}>
              <svg className={searchStyles.searchIcon} aria-hidden="true"
                width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35"
                  stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <label className="gafus-visually-hidden" htmlFor="course-filter-search">Поиск по курсам</label>
              <input className={searchStyles.searchInput}
                id="course-filter-search" type="search" maxLength={120}
                value={filters.search} placeholder="Поиск курсов..."
                onChange={(event) => changeFilters({ search: event.target.value.slice(0, 120) })}/>
              {filters.search && <button type="button" className={searchStyles.clearButton}
                onClick={() => changeFilters({search:""})} aria-label="Очистить поиск">×</button>}
            </div>
          </div>
          <div className={`${filterStyles.filtersContainer} gafus-course-next-filters`}>
            <div className={filterStyles.controlsRow}>
              <button type="button" className={filterStyles.sortButton} aria-expanded={sortOpen}
                onClick={() => {setSortOpen(!sortOpen);setFiltersOpen(false);}}>
                <svg className={filterStyles.sortIcon} width="24" height="24"
                  viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M8 5v14M8 5l-3 3M8 5l3 3M16 19V5M16 19l-3-3M16 19l3-3"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Сортировка</span>
                <svg className={`${filterStyles.arrow} ${sortOpen ? filterStyles.open : ""}`}
                  width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </button>
              <button type="button" className={filterStyles.filterToggleButton} aria-expanded={filtersOpen}
                onClick={() => {
                  if(filtersOpen)closeFilterDrawer();
                  else {
                    setDraftFilters({ ...filters });
                    setDraftRating(ratingFilter);
                    setFiltersOpen(true);
                  }
                  setSortOpen(false);
                }}>
                <svg className={filterStyles.filterIcon} width="24" height="24"
                  viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 6h16M6 12h12M8 18h8"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Фильтры</span>
              </button>
            </div>
            {filtersOpen
              ? createPortal(
                <div className="gafus-app course-next-filters-viewport-layer">
                  <div className="gafus-next-courses course-next-filters-portal">
                    {filterControls}
                  </div>
                </div>,
                // The original Next modal is viewport-fixed, not anchored
                // to the animated/transformed application shell. Render into
                // the body while preserving the app's scoped design tokens.
                document.body,
              )
              : filterControls}
          </div>
        </div>
      )}
      {ready && visible.length === 0 && (
        <p className="empty-state">
          {base.length > 0
            ? "По выбранным фильтрам курсы не найдены."
            : favoritesOnly
              ? "У вас пока нет избранных курсов."
              : "В каталоге пока нет доступных курсов."}
        </p>
      )}
      {ready && visible.length > 0 && (
        <ul className={`${pageStyles.courseList} course-grid`}>
          {visible.map((course) => (
            <LegacyCourseCard key={course.id} course={course} userId={userId}/>
          ))}
        </ul>
      )}

    </section>
  );
}
