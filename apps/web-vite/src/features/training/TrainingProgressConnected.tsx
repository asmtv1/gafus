import { Loading } from "../../shared/ui";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import type { TrainingDaySummary } from "./trainingDaysApi";
import type { TrainingDayDetail } from "./trainingDayApi";
import {
  actionForStep, effectiveStepState, getBoundProgressDay,
  isExpectedStepState, writeBoundStep,
  type ProgressOperation,
} from "./trainingProgressConnectedApi";
import {
  secondsRemaining, timerStorageKey, readSavedClock, saveClock, clearClock,
  type RunningStepClock,
} from "./trainingStepClock";
import {
  acquireStepDayMutation, stepDayIsWriting, stepDayMutationKey,
} from "./trainingStepMutationLease";
import { registerBoundTrainingTimer, cancelBoundTrainingTimer }
  from "./trainingGlobalTimer";
import {PrimaryButton} from "../../shared/ui";
import { TheoryReadingContext } from "./TheoryReadingContext";

const labels: Record<ProgressOperation, string> = {
  start: "Начать", pause: "Пауза", resume: "Продолжить",
  reset: "Начать заново", "complete/practice": "Завершить",
  "complete/theory": "Прочитано — завершить",
  "complete/timer": "Время вышло",
};
const descriptions = {
  NOT_STARTED: "Не начат", RESET: "Сброшен", IN_PROGRESS: "В процессе",
  PAUSED: "На паузе", COMPLETED: "Пройден",
} as const;

const secondsToClock = (seconds: number): string =>
  Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");

/** Registered Web screen only. No synthetic API, no positional-only write,
 * no state mutation until GET returned server StepOnDay binding protocol. */
export function TrainingProgressConnected({
  userId, courseType, day, stepSelection, monitorOnly = false, delegatedExpiry = false,
}: {
  userId: string;
  courseType: string;
  day: TrainingDaySummary;
  monitorOnly?: boolean;
  delegatedExpiry?: boolean;
  /** Original Next renders controls inside that step, never a second full list.
   * Match both ordinal AND template id before exposing controls; the mutation
   * still requires the server-owned StepOnDay occurrence and a fresh GET. */
  stepSelection?: { index: number; id: string };
}) {
  const theoryReadEnd = useContext(TheoryReadingContext);
  const cache = useQueryClient();
  // A cache miss during /me loading is not a different principal. Preserve
  // the requested actor until /me explicitly proves otherwise.
  const initialActor = useRef(
    cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? userId,
  );
  const epoch = useRef(0);
  const [retired, setRetired] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  // Unknown POST ACK may still have committed; a refetch is not proof
  // that repeating a mutation is harmless. Fail closed for this mount.
  const unknownWrite = useRef(false);
  const [requiresNewSession, setRequiresNewSession] = useState(false);
  const clocks = useRef(new Map<string, RunningStepClock>());
  const autoAttempts = useRef(new Set<string>());
  const eligibleClock = useRef(new Set<string>());
  const serverExpiryByOccurrence = useRef(new Map<string, string>());
  const theoryAttempts = useRef(new Set<string>());
  const clockKey = useCallback((occurrenceId: string) =>
    timerStorageKey(userId, day.courseId, day.dayOnCourseId, occurrenceId),
  [userId, day.courseId, day.dayOnCourseId]);
  const mutationKey = stepDayMutationKey(userId, day.courseId, day.dayOnCourseId);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    let subscribed = true;
    const unsubscribe = cache.getQueryCache().subscribe(event => {
      if (event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
        !event.query.queryKey.every((v: unknown, i: number) =>
          v === CURRENT_USER_QUERY_KEY[i])) return;
      // QueryCache also emits observerAdded, fetch, invalidated and error
      // notifications. A transient /me error or an initial pending /me isn't
      // proof of logout. Only a successful authoritative owner mismatch (or
      // cache removal on explicit logout/login) may retire the active scope.
      const authoritative = event.type === "removed" ||
        (event.type === "updated" && event.action.type === "success");
      if (!authoritative || epoch.current !== 0) return;
      const activeUser = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
      if (activeUser?.id === userId) return;
      // Mark synchronously before any in-flight write can pass its actor fence.
      epoch.current++;
      queueMicrotask(() => { if (subscribed) setRetired(true); });
    });
    return () => { subscribed = false; unsubscribe(); };
  }, [cache, userId]);
  const current = useCallback(() => epoch.current === 0 && !retired &&
    initialActor.current === userId &&
    cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId,
  [retired, userId, cache]);
  const query = useQuery({
    queryKey: ["training", "bound-progress", userId, courseType, day.dayOnCourseId],
    queryFn: ({ signal }) => getBoundProgressDay(courseType, day, signal),
    enabled: current() && !day.isLocked, staleTime: 0, gcTime: 0,
    refetchOnWindowFocus: false, retry: false,
  });
  const safe = query.isSuccess && !query.isFetching && current();
  const boundData = query.data;
  const refetchBound = query.refetch;
  useEffect(() => {
    if ((!safe && !query.isFetching) || query.isError || !query.data?.available) {
      clocks.current.clear(); return;
    }
    // Retain the running countdown across a harmless server GET/refetch.
    // The server's next explicit pause/reset/resume causes a new baseline.
    if (query.isFetching) return;
    const valid = new Set<string>();
    for (const step of query.data.steps) {
      if (!step.stepOnDayId) continue;
      if (step.status !== "IN_PROGRESS" || step.paused) {
        // A paused/completed/reset step cannot retain a previous deadline.
        clearClock(clockKey(step.stepOnDayId));
        serverExpiryByOccurrence.current.delete(step.stepOnDayId);
        eligibleClock.current.delete(step.stepOnDayId);
        clocks.current.delete(step.stepOnDayId);
        continue;
      }
      valid.add(step.stepOnDayId);
      const authoritative = step.timerSnapshot;
      if (authoritative?.expiresAt &&
          authoritative.remainingSecAtServerNow !== null) {
        // Server-owned timestamp makes this countdown valid across devices.
        const old = clocks.current.get(step.stepOnDayId);
        if (!eligibleClock.current.has(step.stepOnDayId) || !old ||
            serverExpiryByOccurrence.current.get(step.stepOnDayId) !==
              authoritative.expiresAt) {
          clocks.current.set(step.stepOnDayId, {
            initial: authoritative.remainingSecAtServerNow, startedAt: Date.now(),
          });
          eligibleClock.current.add(step.stepOnDayId);
        }
        serverExpiryByOccurrence.current.set(step.stepOnDayId, authoritative.expiresAt);
        continue;
      }
      // A second progress observer may have started/resumed the timer and
      // persisted its end AFTER this monitor made its initial server GET.
      if (!eligibleClock.current.has(step.stepOnDayId)) {
        const restored = readSavedClock(
          clockKey(step.stepOnDayId), step.remainingSec ?? step.durationSec, Date.now(),
        );
        if (restored) {
          clocks.current.set(step.stepOnDayId, restored);
          eligibleClock.current.add(step.stepOnDayId);
        }
      }
      if (!clocks.current.has(step.stepOnDayId)) {
        const now = Date.now();
        const remaining = step.remainingSec ?? step.durationSec;
        // Next persists an end timestamp. Restore only for the same actor,
        // day and exact StepOnDay occurrence; a cookie/GET still gates writes.
        const restored = readSavedClock(clockKey(step.stepOnDayId), remaining, now);
        const clock = restored ?? { initial: remaining, startedAt: now };
        clocks.current.set(step.stepOnDayId, clock);
        // The Core GET has no historical start time. Without a persisted
        // local deadline, show an estimate but NEVER auto-complete it.
        if (restored) eligibleClock.current.add(step.stepOnDayId);
      }
    }
    for (const id of clocks.current.keys()) {
      if (!valid.has(id)) {
        clocks.current.delete(id);
        eligibleClock.current.delete(id);
        serverExpiryByOccurrence.current.delete(id);
      }
    }
  }, [safe, query.data, query.isError, query.isFetching, clockKey]);
  useEffect(() => {
    if (!safe || !boundData?.available) return;
    for (const step of boundData.steps) {
      if (!step.stepOnDayId) continue;
      const identity = {
        actor: userId, courseId: day.courseId, dayOnCourseId: day.dayOnCourseId,
        stepOnDayId: step.stepOnDayId,
      };
      if (["TRAINING", "BREAK"].includes(step.type) &&
          step.status === "IN_PROGRESS" && !step.paused &&
          step.timerSnapshot?.expiresAt) {
        registerBoundTrainingTimer({
          ...identity, courseType, trainingDayId: day.trainingDayId,
          stepId: step.id, stepIndex: step.index,
          expiresAt: step.timerSnapshot.expiresAt,
        });
      } else {
        cancelBoundTrainingTimer(identity);
      }
    }
  }, [safe, boundData, userId, courseType, day.courseId,
    day.dayOnCourseId, day.trainingDayId]);
  useEffect(() => {
    if (!safe || !query.data?.steps.some(s => s.status === "IN_PROGRESS" && !s.paused))
      return;
    const interval = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [safe, query.data]);
  const doAction = useCallback(async (index: number, action: ProgressOperation) => {
    if (!safe || !boundData?.available || running.current || unknownWrite.current) return;
    const selection = boundData.steps[index];
    if (!selection?.stepOnDayId) return;
    const isTimedCompletion = action === "complete/timer";
    const clock = clocks.current.get(selection.stepOnDayId);
    const isValidTimedFinish = isTimedCompletion &&
      (eligibleClock.current.has(selection.stepOnDayId) ||
        !!selection.timerSnapshot?.expiresAt) &&
      ["TRAINING", "BREAK"].includes(selection.type) &&
      selection.status === "IN_PROGRESS" && !selection.paused &&
      clock && clock.initial >= 0 && secondsRemaining(clock, Date.now()) === 0;
    if (!isValidTimedFinish && !actionForStep(selection).includes(action)) return;
    // Without the locally persisted countdown end, Core's remainingSec
    // alone cannot determine elapsed time for an unpaused running step.
    // Do not overwrite real remainingSec with a fabricated pause value.
    if (action === "pause" && !eligibleClock.current.has(selection.stepOnDayId) &&
        !selection.timerSnapshot?.expiresAt) {
      setMessage("Неизвестно точное время запуска. Сбросьте таймер для нового отсчёта.");
      return;
    }
    // Source Next permits one running timer at a time. Do not start/resume
    // this occurrence while a second step in the same day is running.
    if (["start", "resume"].includes(action) && boundData.steps.some(s =>
      s.stepOnDayId !== selection.stepOnDayId &&
      s.status === "IN_PROGRESS" && !s.paused &&
      ["TRAINING", "BREAK"].includes(s.type))) {
      setMessage("Один шаг уже активен. Сначала остановите его!");
      return;
    }
    const releaseMutation = acquireStepDayMutation(mutationKey);
    if (!releaseMutation) return;
    const beforeEpoch = epoch.current;
    running.current = true; setBusy(true); setMessage(""); setNotice(false);
    let writeAttempted = false;
    try {
      // Recheck the server-owned occurrence and status immediately before POST;
      // in-flight trainer edits still have transactional protection in Core.
      const fresh = await getBoundProgressDay(courseType, day);
      if (epoch.current !== beforeEpoch || !current()) return;
      const matched = fresh.steps[index];
      if (!fresh.available || !matched ||
          matched.id !== selection.id ||
          matched.stepOnDayId !== selection.stepOnDayId ||
          matched.status !== selection.status || matched.paused !== selection.paused ||
          !(isTimedCompletion
            ? ["TRAINING", "BREAK"].includes(matched.type) &&
              matched.status === "IN_PROGRESS" && !matched.paused &&
              (clock && clock.initial >= 0 &&
                secondsRemaining(clock, Date.now()) === 0 ||
                matched.timerSnapshot?.expiresAt &&
                matched.timerSnapshot.remainingSecAtServerNow === 0)
            : actionForStep(matched).includes(action)) ||
          (["start", "resume"].includes(action) && fresh.steps.some(s =>
            s.stepOnDayId !== matched?.stepOnDayId &&
            s.status === "IN_PROGRESS" && !s.paused &&
            ["TRAINING", "BREAK"].includes(s.type)))) {
        setMessage("Состав или состояние шага изменились. Обновите день перед повтором.");
        await refetchBound();
        return;
      }
      const stored = matched.stepOnDayId ? clocks.current.get(matched.stepOnDayId) : null;
      const elapsedRemaining = action === "complete/timer" ? 0
        : action === "pause" && stored
          ? Math.min(matched.timerSnapshot?.remainingSecAtServerNow ??
            matched.remainingSec ?? matched.durationSec,
            secondsRemaining(stored, Date.now()))
          : action === "pause" && matched.timerSnapshot
            ? matched.timerSnapshot.remainingSecAtServerNow ?? undefined
            : undefined;
      writeAttempted = true;
      await writeBoundStep(fresh, matched, action, elapsedRemaining);
      if (epoch.current !== beforeEpoch || !current()) return;
      const after = await refetchBound();
      if (epoch.current !== beforeEpoch || !current()) return;
      const updated = after.data?.steps[index];
      if (after.isError || !after.data?.available || !updated ||
          updated.stepOnDayId !== matched.stepOnDayId ||
          updated.id !== matched.id ||
          !isExpectedStepState(matched, updated, action)) {
        unknownWrite.current = true;
        setRequiresNewSession(true);
        setMessage("Ответ записи не подтверждён. Повтор заблокирован. Откройте день заново после проверки прогресса.");
        return;
      }
      if (matched.stepOnDayId) {
        if (action === "start" || action === "resume") {
          const initial = updated.timerSnapshot?.remainingSecAtServerNow ??
            updated.remainingSec ?? updated.durationSec;
          const newClock = { initial, startedAt: Date.now() };
          clocks.current.set(matched.stepOnDayId, newClock);
          eligibleClock.current.add(matched.stepOnDayId);
          saveClock(clockKey(matched.stepOnDayId), newClock);
        } else if (["pause", "reset", "complete/timer"].includes(action)) {
          clocks.current.delete(matched.stepOnDayId);
          eligibleClock.current.delete(matched.stepOnDayId);
          clearClock(clockKey(matched.stepOnDayId));
          serverExpiryByOccurrence.current.delete(matched.stepOnDayId);
        }
      }
      // The hidden day-level monitor uses a separate observer of this shared
      // query. Refresh AFTER persisting the local deadline so it can adopt a
      // timer newly started by an expanded step, and still finish on collapse.
      if (action === "start" || action === "resume") {
        await cache.invalidateQueries({
          queryKey: ["training", "bound-progress", userId, courseType, day.dayOnCourseId],
          refetchType: "active",
        });
      }
      // Original Next timerStore emits PWA haptics at timer start/finish.
      // Vibration API is optional, including iOS Safari and desktop browsers.
      if (action === "start" || action === "complete/timer") {
        try {
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate(action === "start" ? 20 : [10, 50, 10]);
          }
        } catch { /* haptic unavailability never affects persisted progress */ }
      }
      if (matched.stepOnDayId && ["pause", "reset", "complete/timer"].includes(action))
        cancelBoundTrainingTimer({
          actor: userId, courseId: day.courseId, dayOnCourseId: day.dayOnCourseId,
          stepOnDayId: matched.stepOnDayId,
        });
      const dayKey = ["training", "day", userId, courseType, day.dayOnCourseId];
      if (action === "complete/theory" && updated.status === "COMPLETED" &&
          updated.type === "THEORY" && !updated.locked && current()) {
        // The signed-in owner's bound GET just confirmed the exact occurrence
        // as completed. Project only this status into the already authorized
        // day view, when its step identity still matches. Do not refetch the
        // whole day here: isFetching removes the long open article from DOM,
        // clamping window scroll back to its heading as the reader finishes.
        cache.setQueryData<TrainingDayDetail>(dayKey, old => {
          if (!old || old.courseId !== day.courseId ||
              old.dayOnCourseId !== day.dayOnCourseId ||
              old.steps[index]?.id !== updated.id ||
              old.steps[index]?.type !== "THEORY" ||
              old.steps[index]?.locked ||
              !["NOT_STARTED", "COMPLETED"].includes(old.steps[index].status)) return old;
          return { ...old, steps: old.steps.map((item, position) =>
            position === index ? { ...item, status: "COMPLETED" as const } : item) };
        });
        // Recheck all other day metadata on the next explicit navigation;
        // no sensitive old day content is exposed during an active refetch.
        await cache.invalidateQueries({ queryKey: dayKey, refetchType: "none" });
      } else {
        await cache.invalidateQueries({ queryKey: dayKey });
      }
      // Mark listing stale without unmounting the currently open day mid-action.
      // The next list navigation triggers a fresh owner read.
      await cache.invalidateQueries({
        queryKey: ["training", "days", userId, courseType], refetchType: "none",
      });
      // The confirmed completed state already appears in the step itself.
      // Do not show users an additional technical success message about the server.
    } catch (error) {
      if (epoch.current !== beforeEpoch || !current()) return;
      const knownRejection = error instanceof ApiError &&
        [400, 401, 402, 403, 404, 409, 422, 428, 429].includes(error.status);
      if (writeAttempted && !knownRejection) {
        unknownWrite.current = true;
        setRequiresNewSession(true);
      }
      setMessage(error instanceof ApiError && error.status === 409
        ? "Шаг уже изменён на сервере. Перечитайте день перед новым действием."
        : error instanceof ApiError && error.status === 401
          ? "Сессия завершена. Войдите снова."
          : error instanceof ApiError && [402, 403, 428].includes(error.status)
            ? "Нет доступа к этому шагу или требуется персонализация."
            : "Результат записи неизвестен. Не повторяйте действие без проверки.");
      await refetchBound().catch(() => undefined);
    } finally {
      running.current = false;
      releaseMutation();
      if (epoch.current === beforeEpoch && current()) setBusy(false);
    }
  }, [safe, boundData, refetchBound, current, courseType, day, cache,
    userId, mutationKey, clockKey]);
  useEffect(() => {
    if (!safe || !query.data?.available || busy || requiresNewSession) return;
    // Theory is not completed by opening its accordion. The reader must reach
    // the content end or explicitly confirm reading; server binding still gates POST.
    if (stepSelection && theoryReadEnd) {
      const selected = query.data.steps[stepSelection.index];
      if (selected?.id === stepSelection.id && selected.stepOnDayId &&
          !selected.locked && selected.type === "THEORY" &&
          selected.status === "NOT_STARTED" &&
          !theoryAttempts.current.has(selected.stepOnDayId)) {
        theoryAttempts.current.add(selected.stepOnDayId);
        void doAction(selected.index, "complete/theory");
      }
    }
    // The only automatic completion for timer types happens on real
    // wall-clock zero. A fresh GET and exact occurrence binding precede POST.
    for (const step of query.data.steps) {
      if (delegatedExpiry || running.current || stepDayIsWriting(mutationKey) ||
          !step.stepOnDayId ||
          (!eligibleClock.current.has(step.stepOnDayId) &&
            !step.timerSnapshot?.expiresAt) ||
          !["TRAINING", "BREAK"].includes(step.type) ||
          step.status !== "IN_PROGRESS" || step.paused ||
          stepSelection && (stepSelection.index !== step.index ||
            stepSelection.id !== step.id)) continue;
      const clock = clocks.current.get(step.stepOnDayId);
      if (!clock || clock.initial < 0 || secondsRemaining(clock, clockNow) !== 0 ||
          autoAttempts.current.has(step.stepOnDayId)) continue;
      autoAttempts.current.add(step.stepOnDayId);
      void doAction(step.index, "complete/timer");
      break;
    }
  }, [safe, query.data, clockNow, busy, requiresNewSession,
    stepSelection, theoryReadEnd, delegatedExpiry, mutationKey, doAction]);
  if (monitorOnly) return requiresNewSession || query.isError ||
    message && !notice ? <p role="alert">
      {message || "Не удалось подтвердить фоновый таймер. Перечитайте день."}
    </p> : null;
  return <section className={stepSelection
    ? "training-progress-connected training-progress-inline"
    : "training-progress-connected"}
    aria-label={stepSelection ? "Управление текущим шагом" : "Управление прогрессом тренировочного дня"}>
    {!stepSelection && <h4>Мой прогресс</h4>}
    {!current() && <p role="alert">Сессия изменилась. Откройте день заново.</p>}
    {query.isPending && current() && <Loading message="Проверяем прогресс…" />}
    {query.isFetching && query.data && <p role="status">Сверяем состояние шагов…</p>}
    {query.isError && current() && <div role="alert">
      <p>Не удалось проверить доступ к прогрессу.</p>
      <PrimaryButton type="button" disabled={busy} onClick={() => void query.refetch()}>
        Повторить чтение
      </PrimaryButton>
    </div>}
    {safe && !query.data.available && <div role="alert">
      <p>Сервер пока не подтвердил привязку шагов к этому дню.
        Запись не отправляется, чтобы не изменить другой шаг.</p>
      <button type="button" onClick={() => void query.refetch()}>Перечитать день</button>
    </div>}
    {message && <p role={notice ? "status" : "alert"}>{message}</p>}
    {requiresNewSession && <p role="alert">
      Результат записи не подтверждён. Повтор действий заблокирован до повторного открытия дня.
    </p>}
    {safe && query.data.available && stepSelection &&
      !query.data.steps.some(step => step.index === stepSelection.index &&
        step.id === stepSelection.id && !step.locked && step.stepOnDayId) &&
      <p role="alert">Идентификатор шага изменился. Действия заблокированы.</p>}
    {safe && query.data.available &&
      <ol className={stepSelection ? "training-progress-inline-steps" : "training-steps-list"}>
      {query.data.steps.filter(step => !stepSelection ||
        (step.index === stepSelection.index && step.id === stepSelection.id &&
          !step.locked && !!step.stepOnDayId)).map(step =>
        <li key={step.stepOnDayId ?? `${step.id}-${step.index}`}
          className={stepSelection ? "training-progress-inline-step" : "training-step-card"}>
        {/* Next shows completion in the accordion header (and for PRACTICE,
            the completed badge below). Never repeat a plain status line
            inside an opened step. Standalone progress keeps its summary. */}
        {!stepSelection && <>
          <strong>{step.title}</strong>
          <p>{descriptions[effectiveStepState(step)]}</p>
        </>}
        {!step.locked && step.status === "IN_PROGRESS" && !step.paused &&
          step.stepOnDayId && clocks.current.has(step.stepOnDayId) &&
          <p role="timer">Осталось примерно {
            secondsToClock(secondsRemaining(clocks.current.get(step.stepOnDayId)!, clockNow))
          }</p>}
        {!step.locked && step.status === "IN_PROGRESS" && !step.paused &&
          !!step.stepOnDayId && !eligibleClock.current.has(step.stepOnDayId) &&
          !step.timerSnapshot?.expiresAt &&
          <p role="status">Точное время запуска недоступно на этом устройстве.
            Для нового отсчёта сбросьте таймер.</p>}
        {!step.locked && step.paused &&
          <p role="timer">Осталось: {
            secondsToClock(step.remainingSec ?? step.durationSec)
          }</p>}
        {!step.locked && ["TRAINING", "BREAK"].includes(step.type) &&
          ["NOT_STARTED", "RESET"].includes(step.status) &&
          <p role="timer">Осталось: {secondsToClock(step.durationSec)}</p>}
        {!step.locked && stepSelection && step.type === "PRACTICE" &&
          step.status === "COMPLETED" && (
          <div className="training-next-practice-completed-wrap">
            <div role="status" className="training-next-practice-completed">
              Упражнение выполнено
            </div>
          </div>
        )}
        {!step.locked && actionForStep(step).filter(() =>
          !(stepSelection && step.type === "THEORY")).map(action => {
          const practiceComplete = !!stepSelection && step.type === "PRACTICE" &&
            action === "complete/practice";
          const disabled = busy || requiresNewSession ||
            (action === "pause" && !!step.stepOnDayId &&
              !eligibleClock.current.has(step.stepOnDayId) &&
              !step.timerSnapshot?.expiresAt);
          const accessibleName = `${practiceComplete ? "Я выполнил" : labels[action]}: ${step.title}`;
          return practiceComplete ?
            <PrimaryButton key={action} className="training-next-practice-complete"
              disabled={disabled} aria-label={accessibleName}
              onClick={() => void doAction(step.index, action)}>
              Я выполнил
            </PrimaryButton> :
            <button key={action} type="button" className="button-secondary"
              disabled={disabled} aria-label={accessibleName}
              onClick={() => void doAction(step.index, action)}>
              {labels[action]}
            </button>;
        })}
        {!step.locked && ["EXAMINATION", "DIARY", "SURVEY"].includes(step.type) &&
          <p className="note">Результат этого шага оформляется в отдельном задании выше.</p>}
      </li>)}
    </ol>}
    {safe && query.data.available && !stepSelection &&
      <button type="button" className="button-secondary"
      disabled={busy} onClick={() => { setMessage(""); void query.refetch(); }}>
      Обновить прогресс
    </button>}
  </section>;
}
