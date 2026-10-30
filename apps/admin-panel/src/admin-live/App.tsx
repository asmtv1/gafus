import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AdminHttpError,
  getAdminActor,
  loginAdmin,
  logoutAdmin,
  requestAdmin,
  type AuthActor,
} from "./api";
import { DataPanel } from "./DataPanel";
import { AdminActions } from "./AdminActions";
import { FeatureFlagsEditor, PricingEditor } from "./SettingsEditors";
import { Cynologists, Bookings } from "./Consultations";
import { ScheduleEditor, TrainerPicker } from "./ScheduleEditor";
import { editableScheduleRangeMsk } from "./consultationScheduleTime";
import {
  trainerIdFromScheduleSearch,
  scheduleTrainerUrl,
  validScheduleTrainerId,
} from "./consultationNavigation";
import { UserSubscription } from "./UserSubscription";
import { ProfitExpenses } from "./ProfitExpenses";
import { FeedModerationPanel, QuestionsModerationPanel } from "./ModerationPanels";
import {
  MobileIntroPanel,
  mobileIntroFilterFromSearch,
  mobileIntroReportUrl,
} from "./MobileIntroPanel";
import { AdminCacheSection, AdminStorageSection, MailPanel, StoragePanel } from "./SystemPanels";
import { SubscriptionPanel } from "./SubscriptionPanels";
import { UsersPanel } from "./UserManagement";
import { PartnersPanel } from "./PartnersPanel";
import { ProfitReport } from "./ProfitReport";
import { GafusPanel } from "./GafusPanel";
import { RewardedAdsPanel, ReengagementPanel, BroadcastPanel } from "./AnalyticsPanels";
import { adminSections, matchAdminRoute, maySeeRoute } from "./routes";
import { MailAlertBadge } from "./MailAlertBadge";
import { AdminNavIcon } from "./AdminNavIcon";
import { rewardedPeriodFromSearch, rewardedPeriodUrl, type RewardedPeriod } from "./rewardedPeriod";
import { profitApiUrl, profitSearchFromLocation } from "./profitNavigation";
import {
  normalizedSubscriptionsSearch,
  subscriptionApiUrl,
  subscriptionTabFromSearch,
  subscriptionTabUrl,
  type SubscriptionTab,
} from "./subscriptionNavigation";

function Login({ onLogin }: { onLogin: (actor: AuthActor) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const user = await loginAdmin(username, password);
      setPassword("");
      if (user.role !== "ADMIN" && user.role !== "MODERATOR") {
        await logoutAdmin();
        throw Error("Вход в административную панель разрешён только сотрудникам");
      }
      onLogin(user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand-mark">G</div>
        <h1>Админ-панель GAFUS</h1>
        <p>Войдите под учётной записью администратора или модератора</p>
        <form onSubmit={submit}>
          <label>
            Логин
            <input
              autoComplete="username"
              required
              maxLength={80}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" disabled={pending}>
            {pending ? "Проверяем…" : "Войти"}
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

function Section({
  path,
  actor,
  onExpired,
  onNavigate,
}: {
  path: string;
  actor: AuthActor;
  onExpired: () => void;
  onNavigate: (path: string) => void;
}) {
  const section = matchAdminRoute(path);
  const [data, setData] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [scheduleTrainerId, setScheduleTrainerId] = useState(() =>
    trainerIdFromScheduleSearch(window.location.pathname, window.location.search),
  );
  const [choosingTrainer, setChoosingTrainer] = useState(false);
  const [subscriptionSearch, setSubscriptionSearch] = useState(() =>
    normalizedSubscriptionsSearch(window.location.search),
  );
  const subscriptionTab = subscriptionTabFromSearch(`?${subscriptionSearch}`);
  const selectSubscriptionTab = (tab: SubscriptionTab) => {
    if (section?.key !== "app-subscriptions" || tab === subscriptionTab) return;
    window.history.pushState(null, "", subscriptionTabUrl(tab));
    setSubscriptionSearch(normalizedSubscriptionsSearch(`?tab=${tab}`));
  };
  const [rewardedDays, setRewardedDays] = useState<RewardedPeriod>(() =>
    rewardedPeriodFromSearch(window.location.search),
  );
  const chooseRewardedPeriod = (days: RewardedPeriod) => {
    if (section?.key !== "rewarded-ads" || days === rewardedDays) return;
    window.history.pushState(null, "", rewardedPeriodUrl(days));
    setRewardedDays(days);
  };
  const [gafusPage, setGafusPage] = useState<"dashboard" | "fraud" | "preflight">("dashboard");
  const [profitSearch, setProfitSearch] = useState(() =>
    profitSearchFromLocation(window.location.search),
  );
  const [mobileRange, setMobileRange] = useState(() =>
    mobileIntroFilterFromSearch(window.location.search),
  );
  const reload = useCallback(() => setEpoch((x) => x + 1), []);
  const selectScheduleTrainer = useCallback((id: string) => {
    if (id && !validScheduleTrainerId(id)) return;
    if (window.location.pathname === "/main-panel/consultations/trainers-schedules") {
      window.history.replaceState(null, "", scheduleTrainerUrl(id));
    }
    setChoosingTrainer(!id);
    setScheduleTrainerId(id);
  }, []);
  // The old Next route encoded trainer selection in its query string.
  useEffect(() => {
    setChoosingTrainer(false);
    setScheduleTrainerId(
      trainerIdFromScheduleSearch(window.location.pathname, window.location.search),
    );
    setSubscriptionSearch(normalizedSubscriptionsSearch(window.location.search));
    setRewardedDays(rewardedPeriodFromSearch(window.location.search));
    setProfitSearch(profitSearchFromLocation(window.location.search));
    setMobileRange((previous) => {
      const next = mobileIntroFilterFromSearch(window.location.search);
      return previous.startDate === next.startDate && previous.endDate === next.endDate
        ? previous : next;
    });
  }, [path]);
  useEffect(() => {
    const restoreQuery = () => {
      setChoosingTrainer(false);
      setScheduleTrainerId(
        trainerIdFromScheduleSearch(window.location.pathname, window.location.search),
      );
      setSubscriptionSearch(normalizedSubscriptionsSearch(window.location.search));
      setRewardedDays(rewardedPeriodFromSearch(window.location.search));
      setProfitSearch(profitSearchFromLocation(window.location.search));
      setMobileRange((previous) => {
      const next = mobileIntroFilterFromSearch(window.location.search);
      return previous.startDate === next.startDate && previous.endDate === next.endDate
        ? previous : next;
    });
    };
    window.addEventListener("popstate", restoreQuery);
    return () => window.removeEventListener("popstate", restoreQuery);
  }, []);
  const allowed = !!section && maySeeRoute(section, actor.role);
  const subscriptionUserId =
    path.match(/^\/main-panel\/users\/([a-zA-Z0-9_-]+)\/app-subscription$/)?.[1] ?? null;
  useEffect(() => {
    if (!section || !allowed) return;
    const controller = new AbortController();
    setData(undefined);
    setError(null);
    if (section.key === "users" && subscriptionUserId) {
      // Nested Next details has its own isolated Hono GET, not a global PII list fetch.
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    let url: string = section.api;
    if (section.key === "app-subscriptions") url = subscriptionApiUrl(`?${subscriptionSearch}`);
    if (section.key === "profit") url = profitApiUrl(`?${profitSearch}`);
    if (section.key === "mobile-intro") url = mobileIntroReportUrl(mobileRange);
    if (section.key === "rewarded-ads")
      url = `/api/v1/admin/analytics/rewarded-ads?days=${rewardedDays}`;
    if (section.key === "gafus" && gafusPage !== "dashboard") {
      url =
        gafusPage === "fraud"
          ? "/api/v1/admin/gafus-operations/fraud"
          : "/api/v1/admin/gafus-operations/legacy/preflight";
    }
    if (section.key === "trainers-schedules" && scheduleTrainerId) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(scheduleTrainerId)) {
        setError("Некорректный ID кинолога");
        setLoading(false);
        return;
      }
      const { fromUtc, toUtc } = editableScheduleRangeMsk();
      url =
        `/api/v1/admin/consultations/schedules/${scheduleTrainerId}` +
        `?fromUtc=${encodeURIComponent(fromUtc)}&toUtc=${encodeURIComponent(toUtc)}`;
    }
    requestAdmin<unknown>(url, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof AdminHttpError && cause.status === 401) {
          onExpired();
          return;
        }
        setError(cause instanceof Error ? cause.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    section,
    allowed,
    epoch,
    actor.id,
    scheduleTrainerId,
    subscriptionSearch,
    rewardedDays,
    profitSearch,
    gafusPage,
    mobileRange,
    subscriptionUserId,
    onExpired,
  ]);

  // Match Next: the first trainer is selected by default, but the operator can
  // return to the full picker and deliberately choose somebody else.
  useEffect(() => {
    if (
      section?.key === "trainers-schedules" &&
      !loading &&
      !error &&
      !scheduleTrainerId &&
      !choosingTrainer &&
      Array.isArray(data)
    ) {
      const first = data.find(
        (item) =>
          item && typeof item === "object" && validScheduleTrainerId(String(item.userId ?? "")),
      );
      if (first) selectScheduleTrainer(String(first.userId));
    }
  }, [section, loading, error, data, scheduleTrainerId, choosingTrainer, selectScheduleTrainer]);

  if (!section)
    return (
      <div className="content-card">
        <h2>Страница не найдена</h2>
        <a href="/main-panel">Вернуться в админ-панель</a>
      </div>
    );
  if (!allowed)
    return (
      <div className="content-card">
        <h2>Недостаточно прав</h2>
        <p>Этот раздел недоступен для роли {actor.role}.</p>
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <small>Администрирование / {section.key}</small>
          <h1>{section.title}</h1>
        </div>
        <button className="secondary" disabled={loading} onClick={reload}>
          {loading ? "Обновляем…" : "Обновить"}
        </button>
      </div>
      {section.key === "admin" && actor.role === "ADMIN" && (
        <p className="note">
          <a href="/main-panel/media" onClick={(event) => {
            event.preventDefault();
            onNavigate("/main-panel/media");
          }}>
            Медиа и хранение — отдельный раздел
          </a>
        </p>
      )}
      {section.key === "media" && (
        <p className="note">
          <a href="/main-panel/admin" onClick={(event) => {
            event.preventDefault();
            onNavigate("/main-panel/admin");
          }}>
            Управление системой и кэшем
          </a>
        </p>
      )}
      {section.key === "app-subscriptions" && (
        <div className="filter-toolbar" role="group" aria-label="Разделы подписок">
          {(["payments", "promo-codes", "npd"] as const).map((tab) => (
            <button
              key={tab}
              className={subscriptionTab === tab ? "" : "secondary"}
              aria-pressed={subscriptionTab === tab}
              onClick={() => selectSubscriptionTab(tab)}
            >
              {tab === "payments" ? "Оплаты" : tab === "promo-codes" ? "Промокоды" : "Чеки НПД"}
            </button>
          ))}
        </div>
      )}
      {section.key === "rewarded-ads" && (
        <div className="filter-toolbar" role="group" aria-label="Период рекламной статистики">
          {(["7", "30", "90"] as const).map((days) => (
            <button
              key={days}
              className={rewardedDays === days ? "" : "secondary"}
              aria-pressed={rewardedDays === days}
              onClick={() => chooseRewardedPeriod(days)}
            >
              {days} дней
            </button>
          ))}
        </div>
      )}
      {section.key === "gafus" && (
        <div className="filter-toolbar" role="group" aria-label="Инструменты гафусов">
          {(["dashboard", "fraud", "preflight"] as const).map((tab) => (
            <button
              key={tab}
              className={gafusPage === tab ? "" : "secondary"}
              aria-pressed={gafusPage === tab}
              onClick={() => setGafusPage(tab)}
            >
              {tab === "dashboard"
                ? "Балансы и настройки"
                : tab === "fraud"
                  ? "Антифрод"
                  : "Проверка старых кредитов"}
            </button>
          ))}
        </div>
      )}
      {section.key === "media" && (
        <p className="note">
          Показатели относятся только к хранению видео экзаменов. Остальные медиа ещё не учтены.
        </p>
      )}
      {section.key === "rewarded-ads" && (
        <p className="note">Архивная аналитика. Старые рекламные кредиты не выдаются.</p>
      )}
      {section.key === "reengagement" && (
        <p className="note">
          Ручной запуск выполняется только по явному подтверждению администратора и защищён
          Redis-блокировкой.
        </p>
      )}
      {section.key === "trainers-schedules" && scheduleTrainerId && (
        <div className="filter-toolbar">
          <span className="note">Кинолог: {scheduleTrainerId}</span>
          <button className="secondary" onClick={() => selectScheduleTrainer("")}>
            Выбрать другого кинолога
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="content-card error">
          {error}
          <button className="secondary" onClick={reload}>
            Повторить запрос
          </button>
        </div>
      )}
      {loading && (
        <div className="content-card loading" role="status">
          Получаем данные из GAFUS API…
        </div>
      )}
      {!loading && !error && data !== undefined && section.key === "rewarded-ads" && (
        <RewardedAdsPanel source={data} />
      )}
      {!loading && !error && data !== undefined && section.key === "reengagement" && (
        <ReengagementPanel source={data} onSaved={reload} />
      )}
      {!loading && !error && data !== undefined && section.key === "broadcasts" && (
        <BroadcastPanel source={data} />
      )}
      {!loading && !error && data !== undefined && section.key === "gafus" && (
        <GafusPanel key={`${gafusPage}:${epoch}`} source={data} tab={gafusPage} onSaved={reload} />
      )}
      {!loading && !error && data !== undefined && section.key === "profit" && (
        <ProfitReport key={`${profitSearch}:${epoch}`} source={data} />
      )}
      {!loading && !error && data !== undefined && section.key === "partners" && (
        <PartnersPanel
          key={`${path}:${epoch}`}
          source={data}
          onSaved={reload}
          initialPartnerId={
            path.startsWith("/main-panel/partners/")
              ? path.slice("/main-panel/partners/".length)
              : null
          }
          onNavigate={onNavigate}
        />
      )}
      {!loading &&
        !error &&
        data !== undefined &&
        section.key === "users" &&
        !subscriptionUserId && (
          <UsersPanel
            key={epoch}
            source={data}
            actorRole={actor.role as "ADMIN" | "MODERATOR"}
            actorId={actor.id}
            onSaved={reload}
            onNavigate={onNavigate}
          />
        )}
      {!loading && !error && data !== undefined && section.key === "app-subscriptions" && (
        <SubscriptionPanel
          key={`${subscriptionSearch}:${epoch}`}
          source={data}
          tab={subscriptionTab}
          initialSearch={subscriptionSearch}
          canManage={actor.role === "ADMIN"}
          onSaved={reload}
        />
      )}
      {!loading && !error && data !== undefined && section.key === "mail" && (
        <MailPanel data={data} onRefresh={reload} />
      )}
      {!loading && !error && data !== undefined && section.key === "media" && (
        <StoragePanel data={data} />
      )}
      {!loading && !error && data !== undefined && section.key === "feed-moderation" && (
        <FeedModerationPanel key={epoch} source={data} onSaved={reload} />
      )}
      {!loading && !error && data !== undefined && section.key === "questions" && (
        <QuestionsModerationPanel key={epoch} source={data} onSaved={reload} />
      )}
      {!loading && !error && data !== undefined && section.key === "mobile-intro" && (
        <MobileIntroPanel data={data} range={mobileRange} onApply={setMobileRange} />
      )}
      {!loading && !error && data !== undefined && section.key === "consultations" && (
        <Cynologists key={epoch} source={data} onSaved={reload} />
      )}
      {!loading && !error && data !== undefined && section.key === "bookings" && (
        <Bookings source={data} />
      )}
      {!loading &&
        !error &&
        data !== undefined &&
        section.key === "trainers-schedules" &&
        (scheduleTrainerId ? (
          <ScheduleEditor
            key={`${scheduleTrainerId}:${epoch}`}
            trainerId={scheduleTrainerId}
            source={data}
            onSaved={reload}
          />
        ) : (
          <TrainerPicker source={data} onSelect={selectScheduleTrainer} />
        ))}
      {!loading &&
        !error &&
        data !== undefined &&
        ![
          "rewarded-ads",
          "reengagement",
          "broadcasts",
          "gafus",
          "profit",
          "partners",
          "users",
          "app-subscriptions",
          "mail",
          "media",
          "feed-moderation",
          "questions",
          "mobile-intro",
          "consultations",
          "bookings",
          "trainers-schedules",
        ].includes(section.key) && (
          <div className="content-card">
            <DataPanel data={data} title={section.title} />
          </div>
        )}
      {!loading && !error && data === undefined && !subscriptionUserId && (
        <div className="content-card empty">Нет данных</div>
      )}
      {section.key === "users" && (
        <UserSubscription
          key={path}
          canChange={actor.role === "ADMIN"}
          initialUserId={subscriptionUserId}
          onNavigate={onNavigate}
        />
      )}
      {section.key === "admin" && (
        <AdminCacheSection canChange={actor.role === "ADMIN" || actor.role === "MODERATOR"} />
      )}
      {section.key === "admin" && actor.role === "ADMIN" && <AdminStorageSection />}
      {actor.role === "ADMIN" && section.key === "profit" && !loading && !error && data !== undefined && (
        <ProfitExpenses source={data} onSaved={reload} />
      )}
      {!error && !loading && data !== undefined && section.key === "admin" && (
        <PricingEditor
          key={epoch}
          source={data}
          canChange={actor.role === "ADMIN"}
          onSaved={reload}
        />
      )}
      {actor.role === "ADMIN" &&
        !error &&
        !loading &&
        data !== undefined &&
        section.key === "feature-flags" && (
          <FeatureFlagsEditor
            key={epoch}
            source={data}
            // This editor already GET-verifies every PUT and updates its own
            // draft. Parent reload immediately unmounted the success notice.
            onSaved={() => undefined}
          />
        )}
      {(actor.role === "ADMIN" ||
        (actor.role === "MODERATOR" && section.key === "feed-moderation")) &&
        ![
          "broadcasts",
          "reengagement",
          "gafus",
          "partners",
          "users",
          "feed-moderation",
          "questions",
          "app-subscriptions",
        ].includes(section.key) && <AdminActions sectionKey={section.key} onSaved={reload} />}
      <footer className="content-footer">
        Источник: авторизованный GAFUS API. Изменения сохраняются на сервере.
      </footer>
    </>
  );
}

export function App() {
  const [actor, setActor] = useState<AuthActor | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [path, setPath] = useState(() =>
    ["/", "/login"].includes(window.location.pathname) ? "/main-panel" : window.location.pathname,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const sessionRequest = useRef<ReturnType<typeof getAdminActor> | null>(null);
  useEffect(() => {
    if (["/", "/login"].includes(window.location.pathname)) {
      window.history.replaceState(null, "", "/main-panel");
    }
    const listener = () => setPath(window.location.pathname);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    let mounted = true;
    // StrictMode replays effects in dev. Reuse this mount's pending check so
    // /auth/me and /auth/refresh aren't duplicated (and rate-limited).
    if (!sessionRequest.current) sessionRequest.current = getAdminActor();
    sessionRequest.current
      .then((user) => {
        if (mounted) setActor(user);
      })
      .catch((cause) => {
        if (mounted)
          setAuthError(cause instanceof Error ? cause.message : "Ошибка проверки сессии");
      })
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const onExpired = useCallback(() => setActor(null), []);
  const changePath = useCallback((next: string) => {
    if (!(next === "/main-panel" || next.startsWith("/main-panel/")) || next.startsWith("//"))
      return;
    if (window.location.pathname !== next) window.history.pushState(null, "", next);
    setPath(next);
    setMenuOpen(false);
  }, []);
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logoutAdmin();
      setActor(null);
      changePath("/main-panel");
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Ошибка выхода");
    } finally {
      setSigningOut(false);
    }
  }
  if (authLoading)
    return (
      <main className="auth-page" role="status">
        Проверяем сессию…
      </main>
    );
  if (authError && !actor)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Не удалось получить сессию</h1>
          <p role="alert">{authError}</p>
          <button onClick={() => window.location.reload()}>Повторить</button>
        </div>
      </main>
    );
  if (!actor)
    return (
      <Login
        onLogin={(user) => {
          setAuthError(null);
          setActor(user);
          changePath("/main-panel");
        }}
      />
    );
  if (actor.role !== "ADMIN" && actor.role !== "MODERATOR")
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Доступ запрещён</h1>
          <p>Административная панель доступна только сотрудникам.</p>
          <button onClick={signOut}>Выйти</button>
        </div>
      </main>
    );
  return (
    <div className="admin-layout">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-profile">
          <strong>{actor.username}</strong>
          <span className="sidebar-avatar-fallback" aria-hidden="true">
            {actor.username.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <nav aria-label="Разделы админ-панели">
          {adminSections
            .filter((section) => maySeeRoute(section, actor.role))
            .map((section) => (
              <a
                key={section.key}
                href={section.path}
                aria-current={matchAdminRoute(path)?.key === section.key ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  changePath(section.path);
                }}
              >
                <AdminNavIcon sectionKey={section.key} />
                <span>{section.title}</span>
                {section.key === "mail" && <MailAlertBadge actor={actor} />}
              </a>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="signed-user">
            <strong>{actor.username}</strong>
            <span>{actor.role}</span>
          </div>
          <button className="secondary" disabled={signingOut} onClick={signOut}>
            Выйти
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="menu-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Открыть меню"
            aria-expanded={menuOpen}
          >
            ☰
          </button>
          <span>GAFUS / Панель управления</span>
          <div className="topbar-right">{actor.role}</div>
        </header>
        <main className="workspace-content">
          <Section
            key={path}
            path={path}
            actor={actor}
            onExpired={onExpired}
            onNavigate={changePath}
          />
        </main>
      </div>
    </div>
  );
}
