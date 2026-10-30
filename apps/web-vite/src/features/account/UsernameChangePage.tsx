import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, refreshSession, type AuthUser } from "../../shared/auth/authApi";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { navigate, RouteLink } from "../../shared/router/location";
import { changeUsername, getUsernameAvailability } from "./usernameApi";
import { canonicalCandidate, transportFailure, type CommitAck } from "./usernameContract";
import {PrimaryButton} from "../../shared/ui";
import {CancelNavigationLink} from "../../shared/ui/CancelNavigationLink";
import "./AccountFormTheme.css";

type Availability = { username: string; kind: "checking" | "available" | "taken" | "unknown" };
type Phase = "editing" | "pending" | "syncing" | "reauth" | "unknown";

/** Owned by one authenticated actor and route; parent remounts on principal switch. */
export function UsernameChangePage({ actorId, currentUsername }: {
  actorId: string; currentUsername: string;
}) {
  const cache = useQueryClient();
  const [draft, setDraft] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [phase, setPhase] = useState<Phase>("editing");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const terminal = useRef(false);
  const mounted = useRef(true);
  const checkSeq = useRef(0);
  const latestActor = useRef(actorId);
  latestActor.current = actorId;

  useEffect(() => {
    mounted.current = true;
    const sequence = checkSeq;
    return () => { mounted.current = false; sequence.current++; };
  }, []);

  const candidate = canonicalCandidate(draft);
  const normalized = candidate.ok ? candidate.username : "";
  const isCurrent = candidate.ok && normalized === currentUsername.trim().toLowerCase();

  useEffect(() => {
    const seq = ++checkSeq.current;
    if (!normalized || isCurrent || phase !== "editing") return;
    // The GET is only a hint: never infer uniqueness or authorization from it.
    const checkedUsername = normalized;
    const actor = actorId;
    const timer = window.setTimeout(() => {
      if (!mounted.current || seq !== checkSeq.current || terminal.current) return;
      setAvailability({ username: checkedUsername, kind: "checking" });
      void (async () => {
        const result = await getUsernameAvailability(checkedUsername, actor, seq);
        if (!mounted.current || terminal.current || actor !== latestActor.current ||
          seq !== checkSeq.current) return;
        setAvailability({ username: checkedUsername,
          kind: result.kind === "known"
            ? (result.available ? "available" : "taken") : "unknown" });
      })();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, normalized, isCurrent, actorId, phase]);

  function edit(value: string) {
    if (terminal.current || inFlight.current) return;
    checkSeq.current++;
    setAvailability(null);
    setInvalid(false);
    setError("");
    setDraft(value);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || terminal.current || phase !== "editing") return;
    if (!candidate.ok || isCurrent) {
      setInvalid(true);
      setError(isCurrent ? "Укажите новый логин." :
        "Логин: 3–50 символов, латинские буквы, цифры и подчёркивание.");
      inputRef.current?.focus();
      return;
    }
    if (availability?.username === candidate.username && availability.kind === "taken") {
      setInvalid(true);
      setError("Логин недоступен. Выберите другой.");
      inputRef.current?.focus();
      return;
    }
    inFlight.current = true;
    checkSeq.current++;
    setError("");
    setInvalid(false);
    setPhase("pending");
    const submissionActor = actorId;
    // A failure in the adapter itself is still an UNKNOWN commit outcome.
    // Never allow it to trigger an implicit retry.
    const result = await changeUsername(candidate.username, submissionActor)
      .catch(() => transportFailure());
    try {
      if (!mounted.current || submissionActor !== latestActor.current) return;
      if (result.kind === "discard-stale-actor") {
        terminal.current = true;
        setPhase("unknown");
        setError("Ответ не совпал с учётной записью. Проверьте состояние профиля.");
        return;
      }
      if (result.kind === "not-confirmed") {
        setError(result.message);
        if (result.error === "unknown-outcome") {
          terminal.current = true;
          setPhase("unknown");
        } else {
          setPhase("editing");
        }
        return;
      }
      // Server POST ACK is committed. Never repeat mutation to repair a session.
      terminal.current = true;
      setDraft("");
      setAvailability(null);
      setPhase("syncing");
      await confirmSession(result, submissionActor);
    } finally {
      inFlight.current = false;
    }
  }

  async function confirmSession(ack: CommitAck, actor: string) {
    try {
      // Access JWT embeds username; /me reads the JWT claim, not fresh PG.
      // After a CONFIRMED mutation rotate the existing refresh session ONCE,
      // then verify the new access principal/username. Never replay G03 POST.
      if (!mounted.current || actor !== latestActor.current ||
        cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id !== actor) return;
      await refreshSession();
      if (!mounted.current || actor !== latestActor.current ||
        cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id !== actor) return;
      const session = await getCurrentUser();
      if (!mounted.current || actor !== latestActor.current) return;
      const cached = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
      if (!session || session.id !== actor || cached?.id !== actor ||
        session.username !== ack.canonicalUsername) {
        setPhase("reauth");
        return;
      }
      cache.setQueryData<AuthUser>(CURRENT_USER_QUERY_KEY, session);
      // Never change another actor's cached profile, including on slow ACKs.
      await cache.invalidateQueries({ queryKey: ["user", "profile", actor], refetchType: "none" });
      if (mounted.current && latestActor.current === actor &&
        cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === actor) {
        navigate("/profile");
      }
    } catch {
      // Reauth is follow-up to a CONFIRMED mutation, not evidence of its failure.
      if (mounted.current && latestActor.current === actor) setPhase("reauth");
    }
  }

  if (phase === "reauth") return <section className="account-card gafus-account-form" aria-label="Логин сохранён">
    <h2>Логин изменён</h2>
    <p role="status">Новый логин сохранён, но сессию обновить не удалось. Войдите снова.</p>
    <RouteLink to="/login">Войти снова</RouteLink>
  </section>;

  if (phase === "unknown") return <section className="account-card gafus-account-form" aria-label="Проверка смены логина">
    <h2>Проверьте результат</h2>
    <p role="alert">{error || "Результат изменения логина не подтверждён."}</p>
    <p>Не отправляйте повторный запрос, пока не проверите текущий логин.</p>
    <RouteLink to="/profile">Проверить профиль</RouteLink>
    <RouteLink to="/login">Войти снова</RouteLink>
  </section>;

  if (phase === "syncing") return <section className="account-card gafus-account-form">
    <h2>Логин сохранён</h2>
    <p role="status">Обновляем данные аккаунта…</p>
  </section>;

  const availabilityLabel = !candidate.ok || isCurrent || !availability ||
    availability.username !== normalized ? "" :
    availability.kind === "checking" ? "Проверяем доступность…" :
      availability.kind === "available" ? "Логин предварительно свободен." :
        availability.kind === "taken" ? "Логин занят." :
          "Доступность не удалось проверить. Окончательное решение примет сервер.";

  return <section className="account-card gafus-account-form" aria-label="Смена логина">
    <h2>Изменить логин</h2>
    <p>Используйте 3–50 латинских букв, цифр или знак подчёркивания.</p>
    <p className="note">Проверка доступности предварительная. Изменение выполняется только после нажатия «Сохранить».</p>
    <form onSubmit={submit} noValidate>
      <label htmlFor="account-new-username">Новый логин</label>
      <input id="account-new-username" ref={inputRef} type="text" name="username"
        autoComplete="username" required minLength={3} maxLength={50}
        pattern="[A-Za-z0-9_]{3,50}" value={draft} disabled={phase === "pending"}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "username-form-error" : "username-format-hint"}
        onChange={event => edit(event.target.value)} />
      <p id="username-format-hint" className="note">Регистр букв не учитывается.</p>
      {availabilityLabel && <p role="status">{availabilityLabel}</p>}
      {error && <p id="username-form-error" role="alert">{error}</p>}
      <div className="gafus-account-actions">
        <PrimaryButton type="submit" disabled={phase === "pending"}>
          {phase === "pending" ? "Сохраняем…" : "Сохранить"}
        </PrimaryButton>
        <CancelNavigationLink fallback="/profile" disabled={phase === "pending"} />
      </div>
    </form>
  </section>;
}
