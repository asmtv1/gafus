import { Loading } from "../../shared/ui";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { ApiError } from "../../shared/api/client";
import type { DailyToday } from "./dailyCourseApi";
import type { TrainingStepPreview } from "../training/trainingDayApi";
import { ReadonlyTrainingStepList } from "../training/TrainingDayViewer";
import {
  getDailyBoundDay, dailyAvailableActions, updateDailyBoundStep, boundTimerSeconds,
  type DailyAction,
} from "./dailyBoundProgressApi";
import {PrimaryButton, SecondaryButton, CaramelButton} from "../../shared/ui";

const authIdentity = (value: AuthUser | null | undefined) => value ? JSON.stringify([
  value.id, value.username, value.role,
  (value as AuthUser & { sessionRevision?: unknown }).sessionRevision ?? null,
]) : null;

const names: Record<DailyAction, string> = {
  start: "Начать", pause: "Пауза", resume: "Продолжить",
  reset: "Сбросить", complete: "Завершить шаг",
};
/** Actual daily read+write only when the normal Hono loader is selected.
 * In isolated fixture/readonly tests enableConnected=false is the default. */
export function DailyBoundProgress({ userId, today, steps }: {
  userId: string; today: DailyToday; steps?: TrainingStepPreview[];
}) {
  const cache = useQueryClient();
  const original = useRef(cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY));
  const initialIdentity = useRef(authIdentity(original.current));
  const observedIdentity = useRef(initialIdentity.current);
  const epoch = useRef(0);
  const [retired, setRetired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [notice, setNotice] = useState("");
  const [timerNow, setTimerNow] = useState(() => performance.now());
  const flight = useRef(false);
  useEffect(() => {
    let active = true;
    const stop = cache.getQueryCache().subscribe(event => {
      if (event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
        !event.query.queryKey.every((part: unknown, index: number) =>
          part === CURRENT_USER_QUERY_KEY[index])) return;
      const next = authIdentity(cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY));
      // Cache notifications during same-owner /me revalidation do NOT retire
      // a valid step. Logout/removal, actual actor changes and even a same-ID
      // new sessionRevision still revoke synchronously (A→B→A stays retired).
      if (next === observedIdentity.current && event.type !== "removed") return;
      observedIdentity.current = next;
      epoch.current++;
      queueMicrotask(() => { if (active) setRetired(true); });
    });
    return () => { active = false; stop(); };
  }, [cache]);
  const current = () => !retired && epoch.current === 0 &&
    original.current?.id === userId && initialIdentity.current !== null &&
    authIdentity(cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)) ===
      initialIdentity.current;
  const query = useQuery({
    queryKey: ["daily-course", "bound-progress", userId, today.mskDate, today.scheduleId],
    queryFn: () => getDailyBoundDay(today),
    enabled: current() && !!today.day && !!today.scheduleId,
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false,
  });
  const ready = current() && query.isSuccess && !query.isFetching;
  const ticking = ready && query.data.available && query.data.steps.some(step =>
    step.status === "IN_PROGRESS" && !step.paused &&
    step.timerSnapshot?.expiresAt && query.data.serverNow);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setTimerNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  const act = async (index: number, action: DailyAction) => {
    if (!ready || !query.data.available || flight.current || unknown) return;
    const step = query.data.steps[index];
    if (!step || !dailyAvailableActions(step).includes(action)) return;
    const actorEpoch = epoch.current;
    flight.current = true; setBusy(true); setNotice("");
    try {
      const verified = await updateDailyBoundStep(today, query.data, step, action,
        () => epoch.current === actorEpoch && current());
      if (actorEpoch !== epoch.current || !current()) return;
      // Replace only with successfully checked server state; don't guess new status.
      cache.setQueryData(["daily-course", "bound-progress", userId,
        today.mskDate, today.scheduleId], verified);
      await cache.invalidateQueries({ queryKey: ["daily-course", "day", userId,
        today.mskDate, today.scheduleId], refetchType: "none" });
      await cache.invalidateQueries({ queryKey: ["daily-course", "today", userId],
        refetchType: "none" });
      // The verified step status is already rendered by the card. Only show
      // notices on errors, conflicts or uncertain write outcomes.
    } catch (error) {
      if (actorEpoch !== epoch.current || !current()) return;
      // A deterministic server-side 409 is a rejected mutation, not an
      // invitation to replay POST. Refetch the paired occurrence and require
      // another deliberate click after re-selection.
      const rejectedBinding = error instanceof ApiError && error.status === 409;
      const changedBeforeWrite = error instanceof Error &&
        ["DAILY_STEP_CHANGED", "DAILY_SCHEDULE_CHANGED"].includes(error.message);
      setUnknown(true);
      if (rejectedBinding || changedBeforeWrite) {
        setNotice("Привязка или состояние шага изменились. Проверяем сервер. Повторно действие не отправлено.");
        try {
          const refreshed = await query.refetch();
          if (actorEpoch === epoch.current && current() &&
              refreshed.isSuccess && refreshed.data.available) {
            setUnknown(false);
            setNotice("Прогресс обновлён. Выберите действие заново.");
          }
        } catch {
          // A failed GET is not proof that the mutation applied; leave blocked.
        }
      } else {
        // Network/lost ACK might mean a committed write. Never replay it;
        // a deliberate fresh GET is required before offering actions again.
        setNotice("Ответ записи неизвестен. Перед повтором проверьте день.");
      }
    } finally {
      flight.current = false;
      if (actorEpoch === epoch.current && current()) setBusy(false);
    }
  };
  // Next DayAccordionItem renders one expandable step at a time. In the
  // daily route, keep owner-bound controls *inside* the matching expanded
  // step rather than a second list detached from its content. No command is
  // shown unless fresh Hono occurrence IDs match the detail projection.
  if (steps) {
    const stepBound = (preview: TrainingStepPreview, index: number) => {
      if (!ready || !query.data.available) return null;
      const bound = query.data.steps[index];
      return bound && bound.id === preview.id &&
        bound.type === preview.type && bound.title === preview.title ? bound : null;
    };
    const displayed = steps.map((step, index) => {
      const bound = stepBound(step, index);
      return bound ? { ...step, status: bound.status } : step;
    });
    return <section aria-label="Управление шагами курса дня"
      className="daily-step-actions daily-step-actions--inline">
      {!current() && <p role="alert">Сессия изменилась. Откройте день заново.</p>}
      {query.isPending && current() && <Loading message="Проверяем привязку шагов…" />}
      {query.isFetching && query.data && <Loading variant="compact" message="Перепроверяем шаги…" />}
      {query.isError && current() && <p role="alert">Не удалось прочитать прогресс.
        <PrimaryButton type="button" onClick={() => void query.refetch()}>Проверить ещё раз</PrimaryButton>
      </p>}
      {notice && <p role={unknown ? "alert" : "status"}>{notice}</p>}
      {ready && !query.data.available && <p role="alert">
        Сервер не подтвердил идентификаторы шагов. Запись отключена.
      </p>}
      <ReadonlyTrainingStepList nextRoute steps={displayed}
        onTheoryReadEnd={(step, index) => {
          // Only reaching the actual reading end (or pressing the explicit
          // read confirmation for short content) may complete theory. Opening
          // the step alone must not issue a mutation.
          const bound = stepBound(step, index);
          if (bound && step.type === "THEORY" &&
            dailyAvailableActions(bound).includes("complete"))
            void act(index, "complete");
        }}
        renderProgressSlot={(step, index) => {
          const bound = stepBound(step, index);
          if (!bound) return null;
          const seconds = ready && query.data
            ? boundTimerSeconds(bound, query.data, timerNow) : null;
          const allowed = dailyAvailableActions(bound);
          // PRACTICE still has a deliberate completion button. THEORY is
          // triggered by the end-of-reading control outside this progress slot.
          const actions = bound.type === "THEORY" ? [] :
            bound.type === "PRACTICE" ? allowed.filter(action => action === "complete") :
              allowed;
          return <div className="daily-inline-step-control"
            aria-label={`Прогресс шага ${index + 1}`}>
            {seconds !== null && <span role="timer" aria-live="off"
              className="daily-inline-timer">Осталось: {
                String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
                String(seconds % 60).padStart(2, "0")
              }{bound.paused ? " (пауза)" : ""}</span>}
            {actions.map(action => {
              const label = bound.type === "PRACTICE" && action === "complete" ? "Я выполнил" :
                bound.type === "THEORY" && action === "complete" ? "Прочитал шаг" : names[action];
              const props = {disabled:busy || unknown || query.isFetching,
                onClick:() => void act(bound.stepIndex, action)};
              return action === "pause" || action === "reset"
                ? <SecondaryButton key={action} {...props} variant={action === "reset" ? "red" : "default"}>{label}</SecondaryButton>
                : <PrimaryButton key={action} {...props}>{label}</PrimaryButton>;
            })}
            {/* Read theory already has the shared olive «Прочитано» badge
                inside StepCard; never render a second loose status. */}
            {bound.status === "COMPLETED" && bound.type !== "THEORY" &&
              <span role="status" className="daily-inline-done">
                Упражнение выполнено
              </span>}
          </div>;
        }}/>
      {current() && unknown && <CaramelButton className="daily-next-refresh"
        disabled={busy || query.isFetching} onClick={() => {
          setNotice("");
          void query.refetch().then(result => {
            if (current() && result.isSuccess && result.data.available) setUnknown(false);
          });
        }}>Обновить прогресс</CaramelButton>}
    </section>;
  }
  return <section aria-label="Управление шагами курса дня" className="daily-step-actions">
    <h4>Мой прогресс за день</h4>
    {!current() && <p role="alert">Сессия изменилась. Откройте день заново.</p>}
    {query.isPending && current() && <Loading message="Проверяем привязку шагов…" />}
    {query.isFetching && query.data && <Loading variant="compact" message="Перепроверяем шаги…" />}
    {query.isError && current() && <p role="alert">Не удалось прочитать прогресс.
      <PrimaryButton type="button" onClick={() => void query.refetch()}>Проверить ещё раз</PrimaryButton>
    </p>}
    {notice && <p role={unknown ? "alert" : "status"}>{notice}</p>}
    {ready && !query.data.available && <p role="alert">
      Сервер не подтвердил идентификаторы шагов. Запись отключена.
    </p>}
    {ready && query.data.available && <ol>
      {query.data.steps.map(step => <li key={step.bundleStepId || step.stepIndex}>
        <strong>{step.title}</strong>
        <span> — {step.status === "COMPLETED" ? "Пройден" :
          step.status === "IN_PROGRESS" && step.paused ? "На паузе" :
          step.status === "IN_PROGRESS" ? "В процессе" : "Не начат"}</span>
        {(() => {
          const seconds = boundTimerSeconds(step, query.data, timerNow);
          if (seconds === null) return null;
          return <span role="timer" aria-live="off"> · Осталось по серверу: {
            String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
            String(seconds % 60).padStart(2, "0")
          }{step.paused ? " (пауза)" : ""}</span>;
        })()}
        {dailyAvailableActions(step).map(action => <button type="button"
          key={action} className="button-secondary"
          disabled={busy || unknown} onClick={() => void act(step.stepIndex, action)}>
          {names[action]}
        </button>)}
      </li>)}
    </ol>}
    {current() && <button type="button" className="button-secondary"
      disabled={busy || query.isFetching} onClick={() => {
        setNotice("");
        void query.refetch().then(result => {
          if (current() && result.isSuccess && result.data.available) setUnknown(false);
        });
      }}>Обновить прогресс</button>}
  </section>;
}
