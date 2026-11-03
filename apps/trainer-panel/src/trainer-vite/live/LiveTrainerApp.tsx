import { useCallback, useEffect, useMemo, useRef, useState,
  type FormEvent, type MouseEvent } from "react";
import { TrainerOptInRoute } from "../optInRoute";
import { createVersionedCourseOperations } from "../TR012VersionHttpAdapter20261022";
import { TrainerDashboardRoute } from "../TrainerDashboardRoute";
import { matchLegacyPath } from "../routes";
import { toTrainerBrowserHref, toTrainerBrowserPath, toTrainerLegacyPath } from "./trainerBrowserRoutes";
import {
  buildSession, createTrainerCookieFetch, mutateTrainerApiEnvelope,
  readTrainerApiEnvelope, trainerLogin, trainerLogout, trainerMe,
  TrainerLoginError, type BrowserSession,
} from "./trainerBrowserAuth";

type SessionState =
  | { kind: "checking" }
  | { kind: "guest" }
  | { kind: "unknown" }
  | { kind: "ready"; session: BrowserSession };
const nav = [
  ["Обзор", "/main-panel"],
  ["Статистика", "/main-panel/statistics"],
  ["Шаги", "/main-panel/steps"],
  ["Дни", "/main-panel/days"],
  ["Курс дня", "/main-panel/daily-course"],
  ["Импорт курса дня", "/main-panel/daily-course/import"],
  ["Шаги курса дня", "/main-panel/daily-course/steps?orderBy=createdAt&order=desc&rowsPerPage=25"],
  ["Статистика курса дня", "/main-panel/daily-course/statistics"],
  ["Связки курса дня", "/main-panel/daily-course/bundles"],
  ["Мои видео", "/main-panel/my-videos"],
  ["Экзамены на проверке", "/main-panel/exam-results?hideCompleted=true"],
  ["Все экзамены", "/main-panel/exam-results?hideCompleted=false"],
  ["Статьи", "/main-panel/articles"],
  ["Заметки", "/main-panel/notes"],
  ["Консультации", "/main-panel/consultations"],
  ["Создать шаг", "/main-panel/steps/new"],
  ["Создать день", "/main-panel/days/new"],
  ["Создать курс", "/main-panel/courses/new"],
  ["Создать статью", "/main-panel/articles/new"],
] as const;
const path = () => ({
  pathname: toTrainerLegacyPath(window.location.pathname),
  search: window.location.search,
});
function canonicalizeBrowserPath() {
  const canonicalPath = toTrainerBrowserPath(window.location.pathname);
  if (canonicalPath !== window.location.pathname) {
    window.history.replaceState(
      window.history.state, "", canonicalPath + window.location.search + window.location.hash,
    );
  }
}

export function LiveTrainerApp({ fetchImpl = fetch }: { fetchImpl?: typeof fetch }) {
  const [route, setRoute] = useState(path);
  const [state, setState] = useState<SessionState>({ kind: "checking" });
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const checkRef = useRef(0);

  const retire = useCallback(() => {
    checkRef.current++;
    stateRef.current = { kind: "guest" };
    setState({ kind: "guest" });
  }, []);
  const activeEpoch = state.kind === "ready" ? state.session.epoch : null;
  // A late 401 from a retired actor must not log out a newly logged-in user.
  const cookieFetch = useMemo(() => createTrainerCookieFetch(fetchImpl, () => {
    if (activeEpoch && stateRef.current.kind === "ready" &&
        stateRef.current.session.epoch === activeEpoch) retire();
  }), [fetchImpl, retire, activeEpoch]);
  const recheck = useCallback(async () => {
    const serial = ++checkRef.current;
    try {
      const actor = await trainerMe(fetchImpl);
      if (serial !== checkRef.current) return;
      if (!actor) { retire(); return; }
      const current = stateRef.current;
      // /me revalidation for the SAME owner cannot reactivate a retired session.
      if (current.kind === "guest" && serial !== 1) return;
      const session = current.kind === "ready" &&
        current.session.actor.id === actor.id && current.session.actor.role === actor.role ?
        current.session : buildSession(actor);
      const ready = { kind: "ready" as const, session };
      stateRef.current = ready;
      setState(ready);
    } catch {
      if (serial === checkRef.current) {
        stateRef.current = { kind: "unknown" };
        setState({ kind: "unknown" });
      }
    }
  }, [fetchImpl, retire]);
  useEffect(() => {
    canonicalizeBrowserPath();
    setRoute(path());
    void recheck();
    const onPop = () => { canonicalizeBrowserPath(); setRoute(path()); };
    const onFocus = () => { if (stateRef.current.kind === "ready") void recheck(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("focus", onFocus);
    const requestSequence = checkRef;
    return () => {
      requestSequence.current++;
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("focus", onFocus);
    };
  }, [recheck]);

  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true); setAuthError("");
    const username = loginName;
    const secret = password;
    setPassword("");
    try {
      const actor = await trainerLogin(fetchImpl, username, secret);
      if (!["TRAINER", "ADMIN", "MODERATOR"].includes(actor.role)) {
        await trainerLogout(fetchImpl);
        retire(); setAuthError("Панель доступна только сотрудникам"); return;
      }
      const ready = { kind: "ready" as const, session: buildSession(actor) };
      checkRef.current++;
      stateRef.current = ready; setState(ready);
      setLoginName("");
    } catch (cause) {
      setAuthError(cause instanceof TrainerLoginError ? cause.message :
        "Вход не выполнен. Проверьте соединение и повторите попытку.");
    }
    finally { setLoginBusy(false); }
  };
  const onLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true); setAuthError("");
    try { await trainerLogout(fetchImpl); retire(); }
    catch { setAuthError("Выход не подтверждён. Проверьте состояние сессии."); }
    finally { setLogoutBusy(false); }
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
    const link = event.target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download"))
      return;
    if (link.getAttribute("href")?.startsWith("#")) return;
    const url = new URL(link.href);
    if (url.origin !== window.location.origin) return;
    const legacyPath = toTrainerLegacyPath(url.pathname);
    if (legacyPath !== "/main-panel" && !matchLegacyPath(legacyPath)) return;
    event.preventDefault();
    window.history.pushState(null, "", toTrainerBrowserPath(legacyPath) + url.search + url.hash);
    setRoute(path());
  };
  const current = () => stateRef.current.kind === "ready" ? {
    actor: stateRef.current.session.actor,
    token: stateRef.current.session.witness,
    authEpoch: stateRef.current.session.epoch,
  } : null;
  const jsonRead = useCallback((endpoint: string, signal: AbortSignal) =>
    readTrainerApiEnvelope(cookieFetch, endpoint, signal), [cookieFetch]);
  const jsonWrite = useCallback((input: {
    method: "POST" | "PUT" | "DELETE"; path: string;
    body?: unknown; signal: AbortSignal;
  }) => mutateTrainerApiEnvelope(cookieFetch, input), [cookieFetch]);
  const stepRead = useCallback((input: { method: "GET"; path: string; signal: AbortSignal }) =>
    jsonRead(input.path, input.signal), [jsonRead]);
  const courseWitness = state.kind === "ready" ? state.session.witness : null;
  const courseVersionOperations = useMemo(() =>
    courseWitness && activeEpoch ? createVersionedCourseOperations({
      token: courseWitness, fetchImpl: cookieFetch,
      isCurrent: () => stateRef.current.kind === "ready" &&
        stateRef.current.session.epoch === activeEpoch &&
        stateRef.current.session.witness === courseWitness,
    }) : undefined,
  [courseWitness, activeEpoch, cookieFetch]);
  if (state.kind === "checking")
    return <main className="trainer-auth"><p role="status">Проверка сессии тренера…</p></main>;
  if (state.kind === "unknown") return <main className="trainer-auth">
    <p role="alert">Состояние сессии неизвестно. Данные сотрудников скрыты.</p>
    <button type="button" onClick={() => void recheck()}>Повторить проверку</button>
  </main>;
  if (state.kind === "guest") return <main className="trainer-auth">
    <h1>Вход в панель тренера</h1>
    <form onSubmit={event => void onLogin(event)}>
      <label>Логин<input required autoComplete="username" value={loginName}
        onChange={event => setLoginName(event.target.value)} /></label>
      <label>Пароль<input required type="password" autoComplete="current-password"
        value={password} onChange={event => setPassword(event.target.value)} /></label>
      {authError && <p role="alert">{authError}</p>}
      <button type="submit" disabled={loginBusy}>{loginBusy ? "Входим…" : "Войти"}</button>
    </form>
  </main>;
  const actor = state.session.actor;
  const staff = ["TRAINER", "ADMIN", "MODERATOR"].includes(actor.role);
  if (!staff) return <main className="trainer-auth">
    <h1>Нет доступа к панели тренера</h1>
    <p>Учётная запись {state.session.username} не имеет роли тренера или администратора.
      Для работы с формами войдите под учётной записью сотрудника.</p>
    <button type="button" onClick={() => void onLogout()} disabled={logoutBusy}>Выйти</button>
  </main>;
  return <div className="trainer-shell" onClick={onClick}>
    <aside><h2>ГАФУС · Тренер</h2><p>{state.session.username}</p>
      <nav aria-label="Разделы панели тренера">
        {nav.map(([label, href]) => <a href={toTrainerBrowserHref(href)} key={href}
          aria-current={href.split("?")[0] === route.pathname ? "page" : undefined}>
          {label}</a>)}
      </nav>
      <button type="button" onClick={() => void onLogout()} disabled={logoutBusy}>
        {logoutBusy ? "Выходим…" : "Выйти"}
      </button>
    </aside>
    <div className="trainer-main">
      {authError && <p role="alert">{authError}</p>}
      {!staff ? <main><p role="alert">Нет доступа к панели тренера</p></main> :
        route.pathname === "/main-panel" ?
          <TrainerDashboardRoute key={state.session.epoch}
            actor={actor} token={state.session.witness} authEpoch={state.session.epoch}
            fetchRead={jsonRead} courseWriteTransport={jsonWrite}
            getCurrentSession={current} /> :
        !matchLegacyPath(route.pathname) ?
          <main><p role="alert">Маршрут не найден</p></main> :
          <TrainerOptInRoute key={`${state.session.epoch}:${route.pathname}:${route.search}`}
            pathname={route.pathname} search={route.search} actor={actor}
            token={state.session.witness} authEpoch={state.session.epoch}
            fetchImpl={cookieFetch} getCurrentSession={current}
            enableProposedStatistics enableVisibleSteps enableVisibleDays
            enableDailyCalendar enableDailyBundles enableDailyStatistics
            enableVideoMetadataRead enableVideoManage enableOwnArticlesRead
            enableNotesRead enableExamSummary
            enableAuthoring enableDailyManage enablePublicTemplates
            enableNotesManage enableExamManage enableCourseVersionEditor
            enableArticleManage enableContentManage enableFullCourseEdit
            visibleStepsTransport={stepRead} visibleDaysTransport={jsonRead}
            dailyCalendarTransport={jsonRead} dailyBundleTransport={jsonRead}
            dailyStatisticsTransport={jsonRead} videoMetadataTransport={jsonRead}
            videoManageTransport={jsonWrite}
            ownArticlesTransport={jsonRead} articleWriteTransport={jsonWrite}
            notesReadTransport={jsonRead}
            notesManageTransport={jsonWrite} contentWriteTransport={jsonWrite}
            fullCourseWriteTransport={jsonWrite}
            examSummaryTransport={jsonRead} examManageTransport={jsonWrite}
            courseVersionOperations={courseVersionOperations}
            authoringTransport={jsonWrite}
            dailyManageTransport={jsonWrite} publicTemplateTransport={jsonRead}
            dailyImportTransport={jsonWrite} />}
    </div>
  </div>;
}
