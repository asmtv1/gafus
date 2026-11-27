import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useIsMutating, useMutationState, useQueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY, EXPLICIT_LOGIN_QUERY_KEY, useCurrentUser, useLogout, type ExplicitLoginReceipt } from "./useAuth";
import type { AuthUser } from "./authApi";
import { GafusFooter } from "../../brand/GafusFooter";
import { Loading, PrimaryButton, PrimaryButtonLink } from "../ui";
import type { RoutePath } from "../router/location";
import { NEXT_PUBLIC_WEB_ROUTES } from "../router/routeAccess";

function SessionRecoveryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="gafus-app">
      <main className="shell" aria-label="Защита сессии связанных разделов">
        <section className="empty-state session-recovery-card">{children}</section>
      </main>
      <GafusFooter />
    </div>
  );
}

/** App-lifetime session boundary. Keep its element mounted across changes
 * in whether a route requires the guard. Only enforce blocking for connected
 * routes. Conditional wrapper mounting replaced AppRouter and its owner tour
 * host on /profile -> /consultations, losing the in-progress original tour.
 * Persistence also avoids resetting the A->B->A fence across
 * ordinary navigation. Hono authorization remains independently mandatory.
 */
export function ConnectedFlowSessionBoundary({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const cache = useQueryClient();
  // Preserve the App-lifetime boundary, but do not fetch private identity on
  // public recovery/confirmation pages where no actor session is required.
  const current = useCurrentUser(enabled);
  const refetchSession = current.refetch;
  const logout = useLogout();
  const snapshot = () => cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
  const first = useRef(snapshot() ?? null);
  const last = useRef(first.current);
  const revoked = useRef(false);
  const needsVerification = useRef(false);
  const revision = useRef(0);
  const id = (user: AuthUser | null) =>
    user &&
    JSON.stringify([
      user.id,
      user.username,
      user.role,
      (user as AuthUser & { sessionRevision?: unknown }).sessionRevision ?? null,
    ]);
  const version = useSyncExternalStore(
    (callback) =>
      cache.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
          !event.query.queryKey.every(
            (part: unknown, i: number) => part === CURRENT_USER_QUERY_KEY[i],
          )
        )
          return;
        if (event.type === "removed") {
          if (first.current) {
            // Cache eviction is not a logout. Hide private views until the
            // server confirms the same principal, without losing its baseline.
            needsVerification.current = true;
            revision.current++;
            callback();
          }
          return;
        }
        const next = snapshot();
        if (next === undefined) return;
        const verified = needsVerification.current && (
          next === null ||
          (event.type === "updated" && event.action.type === "success" && !event.action.manual)
        );
        if (verified) needsVerification.current = false;
        if (id(next) !== id(last.current)) {
          // Fresh guest -> first successful login may establish a baseline.
          if (!first.current && next) first.current = next;
          else revoked.current = true;
          last.current = next;
        } else if (!verified) {
          return;
        }
        revision.current++;
        callback();
      }),
    () => revision.current,
    () => revision.current,
  );
  const [loginRecovery, setLoginRecovery] = useState(0);
  const acceptedLogin = useRef(0);
  const receiptEpoch = useSyncExternalStore(
    (callback) =>
      cache.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey.length === EXPLICIT_LOGIN_QUERY_KEY.length &&
          event.query.queryKey.every(
            (part: unknown, i: number) => part === EXPLICIT_LOGIN_QUERY_KEY[i],
          )
        )
          callback();
      }),
    () => cache.getQueryData<ExplicitLoginReceipt>(EXPLICIT_LOGIN_QUERY_KEY)?.epoch ?? 0,
  );
  const explicitReceipt =
    cache.getQueryData<ExplicitLoginReceipt>(EXPLICIT_LOGIN_QUERY_KEY) ?? null;
  // Only an explicitly successful login can establish a NEW App-lifetime
  // baseline after a revoked session. useLogin already cleared the old
  // Query cache; never grant on /me, refresh or A->B->A alone.
  useEffect(() => {
    if (
      !explicitReceipt ||
      receiptEpoch === acceptedLogin.current ||
      !current.isSuccess ||
      !current.data ||
      id(explicitReceipt) !== id(current.data)
    )
      return;
    const hasPrivate =
      cache.getQueryCache().findAll({
        predicate: (q) => q.queryKey[0] !== "auth",
      }).length > 0;
    if (hasPrivate) return;
    acceptedLogin.current = receiptEpoch;
    first.current = current.data;
    last.current = current.data;
    revoked.current = false;
    needsVerification.current = false;
    revision.current++;
    setLoginRecovery((x) => x + 1);
  }, [cache, current.data, current.isSuccess, explicitReceipt, receiptEpoch, loginRecovery]);
  useEffect(() => {
    if (enabled && needsVerification.current) void refetchSession({ cancelRefetch: false });
  }, [enabled, refetchSession, version]);
  const pendingLogout = useIsMutating({ mutationKey: ["auth", "logout"] }) > 0;
  const logoutErrors = useMutationState({
    filters: {
      mutationKey: ["auth", "logout"],
      status: "error",
    },
    select: (mutation) => mutation.state.submittedAt,
  });
  // Login success purges the previous MutationCache. Any remaining logout
  // error is therefore newer than the latest accepted login and ambiguous.
  const recentLogoutError = logoutErrors.length > 0;
  const authPresent = !!current.data?.id;
  // During /auth/me revalidation keep all private connected screens hidden,
  // including a stale cached A while the 401->refresh->/me chain is pending.
  const blocked =
    revoked.current ||
    needsVerification.current ||
    pendingLogout ||
    recentLogoutError ||
    current.isFetching ||
    current.isError ||
    (authPresent &&
      (!first.current ||
        id(first.current) !== id(current.data ?? null) ||
        id(snapshot() ?? null) !== id(current.data ?? null)));
  useEffect(() => {
    if (!revoked.current) return;
    const privateQuery = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "auth";
    void cache
      .cancelQueries({ predicate: privateQuery })
      .then(() => cache.removeQueries({ predicate: privateQuery }));
  }, [cache, version]);
  if (!enabled || !blocked) return <>{children}</>;
  if (pendingLogout || current.isFetching) {
    return (
      <SessionRecoveryLayout>
        <Loading message={pendingLogout ? "Завершаем сессию…" : "Проверяем сессию…"} />
        <p>{pendingLogout ? "Личные данные скрыты." : "Личные данные временно скрыты."}</p>
      </SessionRecoveryLayout>
    );
  }
  if (current.isSuccess && current.data === null && snapshot() === null) {
    return (
      <SessionRecoveryLayout>
        <h1>Сессия завершилась</h1>
        <p role="alert">Войдите в аккаунт, чтобы продолжить.</p>
        <PrimaryButtonLink href="/login">Войти</PrimaryButtonLink>
      </SessionRecoveryLayout>
    );
  }
  if (recentLogoutError) {
    return (
      <SessionRecoveryLayout>
        <h1>Не удалось выйти</h1>
        <p role="alert">Личные данные скрыты.</p>
        <PrimaryButton onClick={() => logout.mutate()}>Повторить выход</PrimaryButton>
      </SessionRecoveryLayout>
    );
  }
  if (!revoked.current) return <SessionCheckError retry={() => void refetchSession()} />;
  return (
    <SessionRecoveryLayout>
      <h1>Сессия изменилась</h1>
      <p role="alert">Личные данные скрыты. Обновите раздел, чтобы продолжить.</p>
      <PrimaryButton onClick={() => window.location.reload()}>Обновить раздел</PrimaryButton>
    </SessionRecoveryLayout>
  );
}

function SessionCheckError({ retry }: { retry: () => void }) {
  return (
    <SessionRecoveryLayout>
      <h1>Не удалось проверить авторизацию</h1>
      <p role="alert">Личные данные скрыты. Проверьте соединение и повторите попытку.</p>
      <PrimaryButton onClick={retry}>Повторить проверку</PrimaryButton>
    </SessionRecoveryLayout>
  );
}

/** Public recovery/confirmation pages must not make an unnecessary /auth/me
 * request or require an existing login. Keep the auth hook mounted only for
 * protected routes, in a stable child component with unconditional hooks. */
export function NextGuestRouteBoundary({
  route,
  children,
}: {
  route: RoutePath | null;
  children: ReactNode;
}) {
  if (route && NEXT_PUBLIC_WEB_ROUTES.has(route)) return <>{children}</>;
  return <NextProtectedRouteBoundary>{children}</NextProtectedRouteBoundary>;
}
function NextProtectedRouteBoundary({ children }: { children: ReactNode }) {
  const current = useCurrentUser();
  const guest = current.isSuccess && !current.isFetching && current.data === null;
  useEffect(() => {
    if (!guest || window.location.pathname === "/") return;
    // Replace protected URL; native Back must not re-enter an auth loop.
    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [guest]);
  if (guest) return null;
  if (current.isError && !current.isFetching) {
    return <SessionCheckError retry={() => void current.refetch()} />;
  }
  if (!current.isSuccess || current.isFetching || !current.data) {
    return (
      <SessionRecoveryLayout>
        <Loading message="Проверяем сессию…" />
      </SessionRecoveryLayout>
    );
  }
  return <>{children}</>;
}
