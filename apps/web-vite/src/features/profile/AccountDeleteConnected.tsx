import { Loading } from "../../shared/ui";
import { BackButtonLink, SecondaryButton } from "../../shared/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import "./AccountDeleteConnected.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../../shared/api/client";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { navigate, RouteLink } from "../../shared/router/location";
import css from "../../brand/LegacyDeleteAccountForm.module.css";

type Phase = "start" | "requesting" | "code" | "review" | "submitting" | "deleted" | "unknown";
/** Real Hono self-account deletion, separate from the synthetic G04 form.
 * No automatic retry: a network failure might follow a committed deletion.
 * The only submit follows code validation + typed username + a checkbox.
 */
export function AccountDeleteConnected({
  ownerId,
  username,
}: {
  ownerId: string;
  username: string;
}) {
  const cache = useQueryClient();
  const initialOwner = useRef(cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY));
  const ownerVerifiedOnMount =
    initialOwner.current?.id === ownerId && initialOwner.current?.username === username;
  // Backend deliberately prohibits deleting ADMIN/TRAINER/other authored
  // platform content through a personal self-service request.
  const selfServiceEligible = initialOwner.current?.role === "USER";
  // The original Next account-delete route checks the owner's email first.
  // Keep the raw private email OUT of React state, query cache, and markup.
  // A GET error must never become a "no email" success or unlock a POST.
  const emailStatus = useQuery({
    queryKey: ["account-deletion", "owner-email-present", ownerId, username],
    queryFn: async () => {
      const raw = await apiRequest<unknown>("/api/v1/user/account/deletion-preflight", {
        method: "GET",
        browserAuth: true,
        expectedStatus: 200,
      });
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw Error("DELETE_EMAIL_INVALID");
      const data = raw as Record<string, unknown>;
      if (
        data.id !== ownerId ||
        data.username !== username ||
        typeof data.hasEmail !== "boolean"
      )
        throw Error("DELETE_EMAIL_OWNER_UNVERIFIED");
      return data.hasEmail === true;
    },
    enabled: ownerVerifiedOnMount && selfServiceEligible,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const emailVerified =
    emailStatus.isSuccess && !emailStatus.isFetching && emailStatus.data === true;
  const [phase, setPhase] = useState<Phase>("start");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef(true);
  const retired = useRef(false);
  const [revoked, setRevoked] = useState(false);
  const operation = useRef<"idle" | "code" | "delete">("idle");
  const attempted = useRef(false);
  useEffect(() => {
    active.current = true;
    const off = cache.getQueryCache().subscribe((event) => {
      if (
        event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
        !event.query.queryKey.every((v: unknown, i: number) => v === CURRENT_USER_QUERY_KEY[i])
      )
        return;
      const principal = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
      // An irreversible delete confirmation from A must not revive after A→B→A.
      const initial = initialOwner.current;
      const revision = (value: AuthUser | null | undefined) =>
        (value as (AuthUser & { sessionRevision?: unknown }) | undefined)?.sessionRevision;
      if (
        event.type === "removed" ||
        principal?.id !== ownerId ||
        principal?.username !== username ||
        principal?.role !== initial?.role ||
        revision(principal) !== revision(initial)
      ) {
        retired.current = true;
        setRevoked(true);
      }
    });
    return () => {
      active.current = false;
      off();
    };
  }, [cache, ownerId, username]);
  const owns = () => {
    const user = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
    return (
      active.current &&
      !retired.current &&
      !revoked &&
      user?.id === ownerId &&
      user?.username === username
    );
  };
  async function requestCode() {
    if (!owns() || !emailVerified || phase !== "start" || operation.current !== "idle") return;
    operation.current = "code";
    setPhase("requesting");
    setMessage("");
    try {
      await apiRequest("/api/v1/user/account/deletion-code", {
        method: "POST",
        json: {},
        browserAuth: true,
        expectedStatus: 200,
      });
      if (!owns()) return;
      setPhase("code");
      setMessage("Код подтверждения отправлен на email аккаунта.");
    } catch (err) {
      if (!owns()) return;
      // An unknown response can still mean an email was sent; don't retry automatically.
      if (err instanceof ApiError && [400, 401, 403, 409].includes(err.status)) {
        setPhase("start");
        setMessage(err.message);
      } else {
        setPhase("unknown");
        setMessage(
          "Неизвестен результат запроса кода. Проверьте почту. Автоматический повтор заблокирован.",
        );
      }
    } finally {
      operation.current = "idle";
    }
  }
  function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase !== "code" || !/^[0-9]{6}$/.test(code) || !owns() || !emailVerified) {
      setMessage("Введите шесть цифр из письма.");
      return;
    }
    setMessage("");
    setPhase("review");
  }
  async function confirmDelete() {
    if (
      !owns() ||
      !emailVerified ||
      phase !== "review" ||
      !consent ||
      typed !== username ||
      !/^[0-9]{6}$/.test(code) ||
      operation.current !== "idle" ||
      attempted.current
    )
      return;
    attempted.current = true;
    operation.current = "delete";
    setPhase("submitting");
    setMessage("");
    try {
      await apiRequest("/api/v1/user/account/delete", {
        method: "POST",
        json: { code },
        browserAuth: true,
        expectedStatus: 200,
      });
      if (!owns()) return;
      setCode("");
      setTyped("");
      setConsent(false);
      setPhase("deleted");
      // Only authoritative HTTP 200 confirms a successful deletion. No retry.
      cache.clear();
      navigate("/login");
    } catch (err) {
      if (!owns()) return;
      if (err instanceof ApiError && [400, 401, 403, 409].includes(err.status)) {
        // A definitive rejected invalid code cannot have succeeded.
        attempted.current = false;
        setPhase("code");
        setCode("");
        setConsent(false);
        setTyped("");
        setMessage(err.message);
      } else {
        setPhase("unknown");
        setCode("");
        setTyped("");
        setConsent(false);
        setMessage(
          "Результат удаления неизвестен. Не отправляйте запрос повторно. Проверьте доступ к аккаунту через новый вход или обратитесь в поддержку.",
        );
      }
    } finally {
      operation.current = "idle";
    }
  }
  if (!owns() && phase !== "deleted")
    return (
      <section className={css.page}>
        <p role="alert">Сессия изменилась. Откройте профиль заново.</p>
        <RouteLink to="/login">Войти</RouteLink>
      </section>
    );
  if (!selfServiceEligible)
    return (
      <section className={css.page} data-next-account-deletion>
        <BackButtonLink to="/profile">В профиль</BackButtonLink>
        <h1>Удаление аккаунта</h1>
        <p role="alert">Самостоятельное удаление доступно только обычному пользователю.
          Аккаунты с управляющими ролями и созданными курсами удаляются через поддержку,
          чтобы не уничтожить обучение других пользователей.</p>
      </section>
    );
  return (
    <section className={css.page} data-next-account-deletion>
      <BackButtonLink to="/profile">В профиль</BackButtonLink>
      <section className={css.card} aria-labelledby="live-account-delete-title">
        <div className={css.iconWrap} aria-hidden="true">
          ✕
        </div>
        <h1 className={css.title} id="live-account-delete-title">
          Удаление аккаунта
        </h1>
        <p className={css.lead}>
          <strong>Действие необратимо.</strong> После удаления восстановить профиль, данные
          тренировок и доступ к аккаунту будет невозможно.
        </p>
        <p className={css.bulletTitle}>Будут удалены или обезличены:</p>
        <ul className={css.bulletList}>
          <li>профиль и настройки;</li>
          <li>контакты учётной записи;</li>
          <li>прогресс тренировок и связанные данные;</li>
          <li>напоминания, сессии и токены доступа.</li>
        </ul>
        <p className={css.hint}>
          Для подтверждения нужен шестизначный код из письма. Если email ещё не указан, сначала{" "}
          <RouteLink to="/profile/change-email">добавьте его</RouteLink>.
        </p>
        {(emailStatus.isPending || emailStatus.isFetching) && (
          <Loading message="Проверяем, указан ли email аккаунта…" />
        )}
        {emailStatus.isError && (
          <div role="alert">
            <p>Не удалось проверить email аккаунта. Запрос кода заблокирован.</p>
            <button
              type="button"
              className={css.secondaryBtn}
              onClick={() => void emailStatus.refetch()}
            >
              Повторить проверку email
            </button>
          </div>
        )}
        {emailStatus.isSuccess && !emailStatus.isFetching && !emailStatus.data && (
          <div role="status">
            <p>Чтобы получить код удаления, сначала укажите email в профиле.</p>
            <RouteLink to="/profile/change-email">Указать или сменить email</RouteLink>
          </div>
        )}
        {emailVerified && phase === "start" && (
          <button type="button" className={css.secondaryBtn} onClick={() => void requestCode()}>
            Отправить код на email
          </button>
        )}
        {phase === "requesting" && <p role="status">Запрашиваем код…</p>}
        {phase === "code" && (
          <form onSubmit={verifyCode}>
            <label htmlFor="account-delete-code">Код из письма</label>
            <input
              id="account-delete-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
            />
            <p className={css.hint}>
              Введите шестизначный код для перехода к последнему подтверждению.
            </p>
            <button type="submit" className={css.secondaryBtn} disabled={!/^[0-9]{6}$/.test(code)}>
              Продолжить
            </button>
          </form>
        )}
        {phase === "review" && (
          <div aria-label="Последнее подтверждение удаления">
            <p className={css.errorBox} role="alert">
              Это окончательное удаление без возможности восстановления.
            </p>
            <label htmlFor="account-delete-username">
              Для подтверждения введите логин: {username}
            </label>
            <input
              id="account-delete-username"
              type="text"
              value={typed}
              maxLength={128}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Я понимаю, что восстановить аккаунт невозможно.
            </label>
            <SecondaryButton
              type="button"
              variant="red"
              className="account-delete-danger-action"
              disabled={!consent || typed !== username}
              onClick={() => void confirmDelete()}
            >
              Удалить навсегда
            </SecondaryButton>
            <button
              type="button"
              className={css.secondaryBtn}
              onClick={() => {
                setPhase("code");
                setConsent(false);
              }}
            >
              Вернуться к коду
            </button>
          </div>
        )}
        {phase === "submitting" && <p role="status">Подтверждаем удаление…</p>}
        {phase === "unknown" && (
          <p className={css.errorBox} role="alert">
            {message}
          </p>
        )}
        {phase === "deleted" && <p role="status">Удаление подтверждено сервером.</p>}
        {message && phase !== "unknown" && (
          <p role={phase === "code" || phase === "start" ? "status" : "alert"}>{message}</p>
        )}
      </section>
    </section>
  );
}
