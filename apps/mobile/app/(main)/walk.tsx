import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Pedometer } from "expo-sensors";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native-paper";
import { TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS } from "@/shared/config";
import { reportClientError } from "@/shared/lib/error-reporting";
import { useAuthStore } from "@/shared/stores/authStore";
import {
  countdownRemainingSeconds,
  finishWalk as finishSession,
  formatWalkDistance,
  formatWalkDuration,
  isWalkRunning,
  pauseWalk as pauseSession,
  resumeWalk,
  startWalk as beginSession,
  totalTodayWalks,
  walkDurationSeconds,
  walkDistanceMeters,
  type DogWalk,
  type WalkTimerMode,
} from "@/features/walk/walkModel";
import {
  emptyWalkJournal,
  loadWalkJournal,
  saveWalkJournal,
  type WalkJournal,
} from "@/features/walk/walkStorage";
import { publishWalkWidgetSnapshot } from "@/features/walk/walkWidgetSnapshot";
import {
  getAndroidWalkStepSnapshot,
  getAndroidWalkStepAvailability,
  reconcileAndroidWalkSteps,
  startAndroidWalkSteps,
  pauseAndroidWalkSteps,
} from "@/features/walk/androidBackgroundSteps";
import { canUseDogWalkHistory } from "@/features/walk/walkAccess";
import { beginWalkQaCapture, gpsWalkMeters, walkQaEnabled } from "@/features/walk/walkGpsStorage";
import { reportCompletedWalkGps } from "@/features/walk/walkGpsCompletionDiagnostics";
import { WalkQaControls } from "@/features/walk/WalkQaControls";
import { startWalkGps, stopWalkGps } from "@/features/walk/walkGpsTask";
import { WalkLocationDisclosure } from "@/features/walk/location-permissions/WalkLocationDisclosure";
import { useWalkLocationPermissionFlow } from "@/features/walk/location-permissions/useWalkLocationPermissionFlow";
import { hasWalkLocationAccess } from "@/features/walk/location-permissions/walkLocationPermissionFlow";
import { WalkRouteMap } from "@/features/walk/WalkRouteMap";
import { syncDogWalkHistory, reportWalkSyncIssue } from "@/features/walk/walkSync";
import {
  configureWalkAlertPermission,
  syncWalkNotifications,
} from "@/features/walk/walkNotifications";

type WalkAction = "start" | "pause" | "finish";
const isWalkAction = (value: unknown): value is WalkAction =>
  value === "start" || value === "pause" || value === "finish";

export default function DogWalkScreen() {
  const router = useRouter();
  const { action } = useLocalSearchParams<{ action?: string }>();
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading && s.verifiedSessionEpoch ? (s.user?.id ?? null) : null,
  );
  const sessionEpoch = useAuthStore((s) => s.verifiedSessionEpoch);
  const { disclosure, answerDisclosure, requestPermissions } =
    useWalkLocationPermissionFlow(owner, sessionEpoch);
  const [gpsStatus, setGpsStatus] = useState<{ segment: string; recording: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const [journal, setJournal] = useState<WalkJournal>(emptyWalkJournal);
  const journalRef = useRef(journal);
  const ownerRef = useRef(owner);
  const [nowMs, setNowMs] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const handledLink = useRef(false);
  const [minutesDraft, setMinutesDraft] = useState("30");
  const [notice, setNotice] = useState<string | null>(null);
  const [qaArmed,setQaArmed]=useState(false);
  const saves = useRef<Promise<void>>(Promise.resolve());
  const saveFailure = useRef<unknown>(null);

  useEffect(() => {
    ownerRef.current = owner;
    saveFailure.current = null;
    journalRef.current = emptyWalkJournal();
    setJournal(journalRef.current);
    setReady(false);
    setGpsStatus(null);
    setQaArmed(false);
    if (!owner) return;
    let cancelled = false;
    void loadWalkJournal(owner)
      .then(async (loaded) => {
        if (cancelled || ownerRef.current !== owner) return;
        if (Platform.OS === "android" && loaded.active) {
          try {
            const snap = await getAndroidWalkStepSnapshot();
            if (cancelled || ownerRef.current !== owner) return;
            const updated = reconcileAndroidWalkSteps(loaded.active, owner, snap);
            if (updated !== loaded.active) {
              loaded.active = updated;
              await saveWalkJournal(owner, loaded);
            }
            // A real foreground launch can recover counting after an ordinary
            // OS process eviction, but a force-stop may leave an unknown gap.
            if (isWalkRunning(loaded.active) && AppState.currentState === "active") {
              const matches = snap?.ownerId === owner && snap.walkId === loaded.active.clientId;
              if (!matches || !snap?.running) {
                // The service was absent or explicitly stopped while the
                // phone journal still showed a running walk: some steps may
                // have been missed, regardless of the type of step sensor.
                loaded.active = { ...loaded.active, incompleteSteps: true };
                await saveWalkJournal(owner, loaded);
              }
              try {
                await startAndroidWalkSteps(owner, loaded.active);
              } catch (error) {
                loaded.active = { ...loaded.active, incompleteSteps: true };
                await saveWalkJournal(owner, loaded);
                setNotice(
                  "Фоновый шагомер не запустился. Проверьте разрешение на физическую активность.",
                );
                reportClientError(error, { issueKey: "DogWalkNativeRestore" });
              }
            }
          } catch (error) {
            loaded.active = { ...loaded.active, incompleteSteps: true };
            reportClientError(error, { issueKey: "DogWalkNativeInitialSnapshot" });
          }
        }
        if (cancelled || ownerRef.current !== owner) return;
        journalRef.current = loaded;
        setJournal(loaded);
        setMinutesDraft(String(loaded.preference.countdownMinutes));
        setReady(true);
        void publishWalkWidgetSnapshot(
          loaded.active ?? loaded.completed[0] ?? null,
          Date.now(),
          loaded.preference.mode,
        ).catch((error: unknown) => reportClientError(error, { issueKey: "DogWalkWidgetLoad" }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setNotice("Не удалось прочитать прогулки. Попробуйте открыть экран снова.");
        reportClientError(error, { issueKey: "DogWalkLoad" });
      });
    return () => {
      cancelled = true;
    };
  }, [owner, sessionEpoch]);

  const updateJournal = useCallback(
    (transform: (current: WalkJournal) => WalkJournal, afterSave?: () => void) => {
      if (!ownerRef.current || !ready) return;
      const actor = ownerRef.current;
      const previous = journalRef.current;
      const next = transform(previous);
      if (next === previous) return;
      // The Android OS updates native widget metrics directly.
      // Avoid re-rendering the whole card after each pedometer poll.
      const stepsOnly =
        Platform.OS === "android" &&
        previous.active !== null &&
        next.active !== null &&
        previous.active.clientId === next.active.clientId &&
        previous.active.startedAtMs === next.active.startedAtMs &&
        previous.active.runningSinceMs === next.active.runningSinceMs &&
        previous.active.elapsedBeforePauseMs === next.active.elapsedBeforePauseMs &&
        previous.active.incompleteSteps === next.active.incompleteSteps &&
        previous.active.mode === next.active.mode &&
        previous.active.steps !== next.active.steps &&
        previous.completed === next.completed &&
        previous.preference === next.preference;
      journalRef.current = next;
      setJournal(next);
      saves.current = saves.current
        .catch(() => { /* diagnostic: expected Prior rejected persistence promise must not poison the serialized save chain. */ return undefined; })
        .then(async () => {
          try {
            await saveWalkJournal(actor, next);
            if (ownerRef.current === actor) saveFailure.current = null;
          } catch (error) {
            if (ownerRef.current === actor) saveFailure.current = error;
            reportClientError(error, { issueKey: "DogWalkSave" });
            return;
          }
          if (ownerRef.current === actor) afterSave?.();
          if (ownerRef.current === actor && !stepsOnly) {
            try {
              await publishWalkWidgetSnapshot(
                next.active ?? next.completed[0] ?? null,
                Date.now(),
                next.preference.mode,
              );
            } catch (error) {
              // A widget redraw error must not invalidate safely stored walks.
              reportClientError(error, { issueKey: "DogWalkWidgetPublish" });
            }
          }
        });
    },
    [ready],
  );

  const updateActive = useCallback(
    (transform: (walk: DogWalk) => DogWalk) => {
      updateJournal((current) => {
        if (!current.active) return current;
        const next = transform(current.active);
        return next === current.active ? current : { ...current, active: next };
      });
    },
    [updateJournal],
  );

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const active = journal.active;
  const running = isWalkRunning(active);
  useEffect(() => {
    if (!ready || !owner || !active || !running) return;
    let cancelled = false;
    let polling: ReturnType<typeof setInterval> | null = null;
    const segmentStart = active.runningSinceMs ?? active.startedAtMs;
    const baseline = active.stepBaselineAtResume ?? active.steps;
    const readIosSteps = async () => {
      try {
        const count = await Pedometer.getStepCountAsync(new Date(segmentStart), new Date());
        if (cancelled || !Number.isFinite(count.steps)) return;
        updateActive((walk) => {
          if (!isWalkRunning(walk) || walk.runningSinceMs !== segmentStart) return walk;
          const steps = Math.max(walk.steps, baseline + Math.floor(count.steps));
          return steps === walk.steps ? walk : { ...walk, steps };
        });
      } catch (error) {
        if (!cancelled) {
          updateActive((walk) =>
            walk.incompleteSteps ? walk : { ...walk, incompleteSteps: true },
          );
          reportClientError(error, { issueKey: "DogWalkPedometerRead" });
        }
      }
    };
    const readAndroidSteps = async () => {
      // Widget controls are authoritative while the app is on the launcher.
      // Polling in background could overwrite a just-paused/finished walk.
      if (AppState.currentState !== "active") return;
      try {
        const snapshot = await getAndroidWalkStepSnapshot();
        if (cancelled || ownerRef.current !== owner || AppState.currentState !== "active") return;
        updateActive((walk) => {
          if (!isWalkRunning(walk) || walk.runningSinceMs !== segmentStart) return walk;
          const merged = reconcileAndroidWalkSteps(walk, owner, snapshot);
          if (
            snapshot?.ownerId === owner &&
            snapshot.walkId === walk.clientId &&
            !snapshot.running
          ) {
            // A launcher pause/finish may be committed concurrently. Do not
            // overwrite it from a stale screen poll.
            return walk;
          }
          return merged;
        });
      } catch (error) {
        if (!cancelled) reportClientError(error, { issueKey: "DogWalkNativePoll" });
      }
    };
    const startSensor = async () => {
      if (Platform.OS === "android") {
        await readAndroidSteps();
        if (!cancelled)
          polling = setInterval(() => {
            void readAndroidSteps();
          }, 3_000);
        return;
      }
      try {
        const available = await Pedometer.isAvailableAsync();
        const permissions = available ? await Pedometer.getPermissionsAsync() : null;
        if (cancelled) return;
        if (!available || !permissions?.granted) {
          setNotice("Шагомер недоступен или нет разрешения на физическую активность.");
          updateActive((walk) =>
            walk.incompleteSteps ? walk : { ...walk, incompleteSteps: true },
          );
          return;
        }
        await readIosSteps();
        polling = setInterval(() => {
          void readIosSteps();
        }, 15_000);
      } catch (error) {
        if (!cancelled) {
          setNotice("Не удалось запустить шагомер. Проверьте разрешения телефона.");
          updateActive((walk) =>
            walk.incompleteSteps ? walk : { ...walk, incompleteSteps: true },
          );
          reportClientError(error, { issueKey: "DogWalkPedometerWatch" });
        }
      }
    };
    void startSensor();
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Platform.OS !== "android") {
        void readIosSteps();
      }
      // Android foreground hydration lives in the separate journal effect;
      // the normal 3s poll resumes only after that reconciliation.
    });
    return () => {
      cancelled = true;
      if (polling) clearInterval(polling);
      appSub.remove();
    };
    // Re-subscribe only for new walking segments, not on every pedometer sample.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, owner, active?.startedAtMs, active?.runningSinceMs, running, updateActive]);

  const captureSegmentSteps = useCallback(
    async (walk: DogWalk, now: number, finish = false): Promise<DogWalk> => {
      if (Platform.OS === "android") {
        const actor = ownerRef.current;
        if (!actor) return { ...walk, incompleteSteps: true };
        try {
          const snapshot = await pauseAndroidWalkSteps(actor, walk, finish);
          return reconcileAndroidWalkSteps(walk, actor, snapshot);
        } catch (error) {
          reportClientError(error, { issueKey: "DogWalkNativePauseOrFinish" });
          setNotice("Не удалось получить итоговые шаги с Android. Проверьте разрешения телефона.");
          return { ...walk, incompleteSteps: true };
        }
      }
      if (!isWalkRunning(walk)) return walk;
      try {
        const result = await Pedometer.getStepCountAsync(
          new Date(walk.runningSinceMs ?? walk.startedAtMs),
          new Date(now),
        );
        const steps = Math.max(walk.steps, (walk.stepBaselineAtResume ?? 0) + result.steps);
        return { ...walk, steps };
      } catch (error) {
        reportClientError(error, { issueKey: "DogWalkFinalSegmentSteps" });
        return { ...walk, incompleteSteps: true };
      }
    },
    [],
  );

  const notify = useCallback(async (actor: string, walk: DogWalk | null, granted: boolean) => {
    try {
      await syncWalkNotifications(actor, walk, granted);
    } catch (error) {
      reportClientError(error, { issueKey: "DogWalkReminderSchedule" });
      setNotice("Не удалось настроить напоминания. Прогулку можно продолжать без уведомлений.");
    }
  }, []);

  const ensureAndroidTracking = useCallback(
    async (actor: string, walk: DogWalk) => {
      if (Platform.OS !== "android") return;
      // The phone journal is durable before starting an OS service that may outlive React.
      await saves.current;
      if (ownerRef.current !== actor) return;
      if (saveFailure.current) {
        setNotice(
          "Не удалось сохранить прогулку на телефоне. Фоновый шагомер не включён, чтобы не потерять данные.",
        );
        return;
      }
      try {
        const native = await startAndroidWalkSteps(actor, walk);
        if (ownerRef.current === actor) {
          updateActive((current) => reconcileAndroidWalkSteps(current, actor, native));
        }
      } catch (error) {
        if (ownerRef.current !== actor) return;
        updateActive((current) =>
          current.incompleteSteps ? current : { ...current, incompleteSteps: true },
        );
        setNotice(
          "Не удалось включить фоновый подсчёт шагов. Проверьте разрешение на физическую активность и перезапустите прогулку.",
        );
        reportClientError(error, { issueKey: "DogWalkNativeStart" });
      }
    },
    [updateActive],
  );

  const ensureGpsTracking = useCallback(
    async (
      actor: string,
      walk: DogWalk,
      askPermission: boolean,
      isScreenCurrent: () => boolean = () => true,
    ) => {
      const walkId = walk.clientId;
      if (!walkId) return;
      const segment = `${actor}:${sessionEpoch}:${walkId}:${walk.runningSinceMs}`;
      const isCurrent = () => {
        const auth = useAuthStore.getState();
        const current = journalRef.current.active;
        return (
          auth.isAuthenticated &&
          !auth.isLoading &&
          auth.user?.id === actor &&
          auth.verifiedSessionEpoch === sessionEpoch &&
          current?.clientId === walkId &&
          current.runningSinceMs === walk.runningSinceMs &&
          isWalkRunning(current)
        );
      };
      await saves.current;
      const isActionCurrent = () => isScreenCurrent() && isCurrent();
      if (!isActionCurrent() || saveFailure.current) return;
      let recording = false;
      try {
        if ((!askPermission || (await requestPermissions(isActionCurrent))) && isActionCurrent()) {
          recording = await startWalkGps(actor, walkId, false, isCurrent);
        }
      } catch (error) {
        reportClientError(error, { issueKey: "DogWalkGpsStart" });
      }
      if (!isActionCurrent()) return;
      setGpsStatus({ segment, recording });
      if (recording) {
        updateActive((current) =>
          current.clientId === walkId && !current.gpsEnabled
            ? { ...current, gpsEnabled: true }
            : current,
        );
      }
    },
    [requestPermissions, sessionEpoch, updateActive],
  );

  // A launcher widget may have changed the local journal. Reload it before
  // restoring an existing GPS session or handling a return from settings.
  useEffect(() => {
    if (!ready || !owner) return;
    let disposed = false;
    const isScreenCurrent = () => !disposed && ownerRef.current === owner && !busyRef.current;
    const restore = async () => {
      if (!isScreenCurrent() || AppState.currentState !== "active") return;
      await saves.current;
      const latest = await loadWalkJournal(owner);
      if (!isScreenCurrent()) return;
      const previous = journalRef.current;
      const walk = latest.active;
      if (
        previous.active?.clientId !== walk?.clientId ||
        previous.active?.runningSinceMs !== walk?.runningSinceMs ||
        previous.active?.steps !== walk?.steps ||
        previous.active?.gpsEnabled !== walk?.gpsEnabled ||
        previous.completed[0]?.finishedAtMs !== latest.completed[0]?.finishedAtMs
      ) {
        journalRef.current = latest;
        setJournal(latest);
      }
      if (walk?.clientId && isWalkRunning(walk)) {
        // Recover a failed initial start as well as a previously recorded walk.
        // This path never prompts for permission.
        const allowed = walk.gpsEnabled || (await hasWalkLocationAccess());
        if (allowed && isScreenCurrent() && AppState.currentState === "active") {
          await ensureGpsTracking(owner, walk, false, isScreenCurrent);
        }
      }
    };
    const refresh = () =>
      void restore().catch((error: unknown) =>
        reportClientError(error, { issueKey: "DogWalkGpsRestore" }),
      );
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [ready, owner, ensureGpsTracking]);

  const onGpsMeters = useCallback((walkId: string, meters: number | null) => {
    if (!ready || !owner || ownerRef.current !== owner || meters == null) return;
    updateActive(current =>
      current.clientId === walkId && current.gpsMeters !== meters
        ? { ...current, gpsMeters: meters }
        : current,
    );
  }, [ready, owner, updateActive]);

  const performAction = useCallback(
    async (request: WalkAction | "enableGps", fromWidget = false) => {
      if (!ready || !owner || ownerRef.current !== owner || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const current = journalRef.current.active;
        if (request === "enableGps") {
          if (current && isWalkRunning(current)) await ensureGpsTracking(owner, current, true);
        } else if (request === "start") {
          if (current && isWalkRunning(current)) return;
          // The tap, not the permission dialog, defines the walk's start.
          const at = Date.now();
          const preference = journalRef.current.preference;
          const walk: DogWalk = current
            ? { ...resumeWalk(current, at), stepBaselineAtResume: current.steps }
            : {
                ...beginSession(preference.mode, at, preference.countdownMinutes * 60),
                clientId: Crypto.randomUUID(),
                incompleteSteps: true,
              };
          updateJournal((state) =>
            current
              ? state.active?.startedAtMs === current.startedAtMs
                ? { ...state, active: walk }
                : state
              : state.active ? state : { ...state, active: walk },
          );
          await saves.current;
          const isCurrent = () => {
            const auth=useAuthStore.getState();
            return auth.isAuthenticated&&!auth.isLoading&&auth.user?.id===owner&&auth.verifiedSessionEpoch===sessionEpoch&&
              ownerRef.current===owner&&journalRef.current.active?.clientId===walk.clientId&&
              journalRef.current.active?.runningSinceMs===walk.runningSinceMs;
          };
          if (!isCurrent() || saveFailure.current) return;
          if(!current&&qaArmed&&walk.clientId&&walkQaEnabled()) {
            setQaArmed(false);
            try { await beginWalkQaCapture(owner,walk.clientId,Crypto.randomUUID(),isCurrent); }
            catch { /* diagnostic: expected Optional QA capture must not stop a normal walk. */  if(isCurrent()) setNotice("QA-запись недоступна. Обычная прогулка продолжится без диагностики."); }
          }
          if(!isCurrent()) return;
          // Android permission activities temporarily background the app, even
          // when a permission is already granted. Never race a location FGS
          // registration with notification or physical-activity permission UI.
          let notificationsGranted = false;
          try {
            notificationsGranted = await configureWalkAlertPermission();
            if (!notificationsGranted && isCurrent()) {
              setNotice("Для сигнала таймера и напоминаний разрешите уведомления GAFUS.");
            }
          } catch (error) {
            reportClientError(error, { issueKey: "DogWalkNotificationPermissions" });
          }
          if (!isCurrent()) return;
          if (current) {
            await ensureAndroidTracking(owner, walk);
            await notify(owner, walk, notificationsGranted);
            if (walk.gpsEnabled || Platform.OS !== "android" || (await hasWalkLocationAccess())) {
              await ensureGpsTracking(owner, walk, Platform.OS !== "android" && !fromWidget);
            }
            return;
          }
          let incompleteSteps = false;
          try {
            // Request Android motion permission even when Expo's own watcher is
            // unavailable: our native Step Detector can still be present.
            const permission =
              Platform.OS === "android"
                ? await Pedometer.requestPermissionsAsync()
                : await (async () => {
                    const available = await Pedometer.isAvailableAsync();
                    return available ? Pedometer.requestPermissionsAsync() : null;
                  })();
            incompleteSteps = !permission?.granted;
          } catch (error) {
            incompleteSteps = true;
            reportClientError(error, { issueKey: "DogWalkStepPermissions" });
          }
          if (!isCurrent()) return;
          if (Platform.OS === "android") {
            try {
              const sensor = await getAndroidWalkStepAvailability();
              if (sensor !== "counter" && sensor !== "detector") incompleteSteps = true;
              if (sensor === "detector") {
                setNotice(
                  "На телефоне нет аппаратного счётчика: отдельные шаги считаются в фоне, но после перезапуска системы возможен пропуск.",
                );
              }
            } catch (error) {
              incompleteSteps = true;
              reportClientError(error, { issueKey: "DogWalkNativeSensorAvailability" });
            }
          }
          if (!isCurrent()) return;
          updateActive((active) => active.clientId === walk.clientId
            ? { ...active, incompleteSteps }
            : active);
          await ensureAndroidTracking(owner, { ...walk, incompleteSteps });
          if (!isCurrent()) return;
          await notify(owner, walk, notificationsGranted);
          // Start after all other permission requests and native step setup.
          if (isCurrent()) await ensureGpsTracking(owner, walk, !fromWidget);
        } else if (current) {
          if (request === "pause" && !isWalkRunning(current)) return;
          setGpsStatus(null);
          const now = Date.now();
          if (current.clientId) {
            try {
              await stopWalkGps(owner, current.clientId, now);
            } catch (error) {
              reportClientError(error, { issueKey: "DogWalkGpsStop" });
            }
          }
          const captured = await captureSegmentSteps(current, now, request === "finish");
          if (ownerRef.current !== owner) return;
          if (request === "pause") {
            const paused = pauseSession(captured, now);
            updateJournal((state) =>
              state.active?.startedAtMs === current.startedAtMs
                ? { ...state, active: paused }
                : state,
            );
          } else {
            let finalGpsMeters: number | null = null;
            if (current.clientId) {
              try {
                finalGpsMeters = await gpsWalkMeters(owner, current.clientId);
              } catch (error) {
                reportClientError(error, { issueKey: "DogWalkGpsFinish" });
              }
            }
            const completed = finishSession(
              { ...captured, gpsMeters: finalGpsMeters ?? captured.gpsMeters },
              now,
            );
            updateJournal((state) =>
              state.active?.startedAtMs === current.startedAtMs
                ? {
                    ...state,
                    active: null,
                    completed: [completed, ...state.completed].slice(0, 2000),
                  }
                : state,
              () => { void reportCompletedWalkGps(owner, completed, () => {
                const auth = useAuthStore.getState();
                return ownerRef.current === owner && auth.user?.id === owner &&
                  auth.verifiedSessionEpoch === sessionEpoch;
              }).catch(() => { /* diagnostic: expected Completed-walk diagnostic reporting cannot change a saved walk. */ return undefined; }); },
            );
          }
          await notify(owner, null, false);
          if (request === "finish" && canUseDogWalkHistory(useAuthStore.getState().user)) {
            // Save and show on the phone first; server errors never erase it.
            await saves.current;
            void syncDogWalkHistory(owner).catch(reportWalkSyncIssue);
          }
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [
      ready,
      owner,
      sessionEpoch,
      updateJournal,
      updateActive,
      qaArmed,
      notify,
      captureSegmentSteps,
      ensureAndroidTracking,
      ensureGpsTracking,
    ],
  );

  // Widget links open this screen even when the app was not running. Consume
  // each action once, only after verified auth and journal rehydration.
  useEffect(() => {
    if (!ready || !isWalkAction(action)) {
      if (!action) handledLink.current = false;
      return;
    }
    if (handledLink.current) return;
    handledLink.current = true;
    void performAction(action, true).finally(() => router.setParams({ action: "" }));
  }, [ready, action, performAction, router]);

  const setMode = useCallback(
    (mode: WalkTimerMode) => {
      updateJournal((state) =>
        state.active
          ? state
          : {
              ...state,
              preference: { ...state.preference, mode },
            },
      );
    },
    [updateJournal],
  );
  const saveMinutes = useCallback(() => {
    const minutes = Math.max(1, Math.min(240, Number.parseInt(minutesDraft, 10) || 30));
    setMinutesDraft(String(minutes));
    updateJournal((state) =>
      state.active
        ? state
        : {
            ...state,
            preference: { ...state.preference, countdownMinutes: minutes },
          },
    );
  }, [minutesDraft, updateJournal]);
  const selected = active ?? null;
  const mode = active?.mode ?? journal.preference.mode;
  const seconds = selected
    ? mode === "countdown"
      ? countdownRemainingSeconds(selected, nowMs)
      : walkDurationSeconds(selected, nowMs)
    : mode === "countdown"
      ? Math.max(1, Math.min(240, Number.parseInt(minutesDraft, 10) || 30)) * 60
      : 0;
  const today = totalTodayWalks(journal.completed, nowMs);
  const gpsSegment = `${owner}:${sessionEpoch}:${active?.clientId}:${active?.runningSinceMs}`;
  const gpsRecording = running && gpsStatus?.segment === gpsSegment && gpsStatus.recording;

  return (
    <TexturedSafeAreaView style={styles.page}>
      {disclosure ? (
        <WalkLocationDisclosure details={disclosure} onDecision={answerDisclosure} />
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <MaterialCommunityIcons name="chevron-left" size={27} color={COLORS.primaryDark} />
          </Pressable>
          <View style={styles.topTitles}>
            <Text style={styles.eyebrow}>ВРЕМЯ ВМЕСТЕ</Text>
            <Text style={styles.heading}>На прогулке</Text>
          </View>
          <View style={styles.topPaw}>
            <MaterialCommunityIcons name="paw" size={23} color={COLORS.primary} />
          </View>
        </View>
        <Text style={styles.subheading}>Время, шаги и маршрут прогулки по GPS</Text>
        <View style={styles.card}>
          <Text style={styles.caption}>Режим таймера</Text>
          <View style={styles.modeRow}>
            {(["stopwatch", "countdown"] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityLabel={item === "stopwatch" ? "Обычный таймер" : "Обратный отсчёт"}
                disabled={Boolean(active) || !ready || busy}
                onPress={() => setMode(item)}
                style={[styles.modeButton, mode === item && styles.modeSelected]}
              >
                <Text style={[styles.modeLabel, mode === item && styles.modeSelectedLabel]}>
                  {item === "stopwatch" ? "Обычный" : "Обратный отсчёт"}
                </Text>
              </Pressable>
            ))}
          </View>
          {mode === "countdown" && !active ? (
            <View style={styles.minutesRow}>
              <Text style={styles.caption}>Длительность, минут (1–240)</Text>
              <TextInput
                accessibilityLabel="Длительность прогулки в минутах"
                keyboardType="number-pad"
                maxLength={3}
                value={minutesDraft}
                onChangeText={setMinutesDraft}
                onBlur={saveMinutes}
                style={styles.minutesInput}
                selectTextOnFocus
              />
            </View>
          ) : null}
          <LinearGradient
            colors={["#677950", "#3C4C2E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.timerPanel}
          >
            <View style={styles.timerStatus}>
              <View style={[styles.statusDot, running && styles.statusDotRunning]} />
              <Text style={styles.timerStatusText}>
                {!active ? "ГОТОВЫ К ПРИКЛЮЧЕНИЮ" : running ? "ГУЛЯЕМ СЕЙЧАС" : "ПРОГУЛКА НА ПАУЗЕ"}
              </Text>
            </View>
            <View style={styles.timerHalo}>
              <MaterialCommunityIcons name="paw" size={23} color="#D8E5C4" />
              <Text style={styles.timer}>{formatWalkDuration(seconds)}</Text>
              <Text style={styles.timerHint}>
                {mode === "countdown" ? "осталось времени" : "время прогулки"}
              </Text>
            </View>
            {active?.mode === "countdown" && seconds === 0 ? (
              <Text style={styles.timerWarning}>Время вышло. Можно продолжить прогулку.</Text>
            ) : null}
            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.value}>{selected?.steps.toLocaleString("ru-RU") ?? "0"}</Text>
                <Text style={styles.metricCaption}>шагов</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.value}>
                  {selected?.gpsMeters == null ? "≈ " : ""}
                  {formatWalkDistance(selected ? walkDistanceMeters(selected) : 0)}
                </Text>
                <Text style={styles.metricCaption}>расстояние</Text>
              </View>
            </View>
          </LinearGradient>
          {!ready ? (
            <Text style={styles.note}>Загрузка прогулок…</Text>
          ) : (
            <View style={styles.controls}>
              {!running ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={active ? "Продолжить прогулку" : "Начать прогулку"}
                  disabled={busy}
                  onPress={() => {
                    void performAction("start");
                  }}
                  style={[styles.action, styles.startButton, busy && styles.disabled]}
                >
                  <MaterialCommunityIcons name="play" size={20} color="#FFFFFF" />
                  <Text style={styles.buttonText}>{active ? "Продолжить" : "Начать"}</Text>
                </Pressable>
              ) : null}
              {running ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Пауза прогулки"
                  disabled={busy}
                  onPress={() => {
                    void performAction("pause");
                  }}
                  style={[styles.action, styles.pauseButton, busy && styles.disabled]}
                >
                  <MaterialCommunityIcons name="pause" size={20} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Пауза</Text>
                </Pressable>
              ) : null}
              {active ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Завершить прогулку"
                  disabled={busy}
                  onPress={() => {
                    void performAction("finish");
                  }}
                  style={[styles.action, styles.finishButton, busy && styles.disabled]}
                >
                  <MaterialCommunityIcons name="stop" size={20} color={COLORS.primaryDark} />
                  <Text style={styles.finishText}>Завершить</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
        {ready&&owner&&walkQaEnabled()?<WalkQaControls key={owner} ownerId={owner} active={!!active} armed={qaArmed} onArmChange={setQaArmed} busy={busy}/>:null}
        {active?.clientId && active.gpsEnabled ? (
          <WalkRouteMap ownerId={owner ?? ""} walkId={active.clientId} live={gpsRecording} localOnly onGpsMeters={onGpsMeters} />
        ) : null}
        {active && running && !gpsRecording && owner ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Включить GPS-маршрут прогулки"
            disabled={busy}
            style={styles.gpsRetry}
            onPress={() => void performAction("enableGps")}
          >
            <MaterialCommunityIcons name="crosshairs-gps" size={20} color={COLORS.primaryDark} />
            <Text style={styles.gpsRetryText}>Включить GPS-маршрут</Text>
          </Pressable>
        ) : null}
        {running && gpsStatus?.segment === gpsSegment && !gpsStatus.recording ? (
          <Text style={styles.warning}>
            Маршрут выключен. Таймер и подсчёт шагов продолжают работать.
          </Text>
        ) : null}
        {notice ? <Text style={styles.warning}>{notice}</Text> : null}
        {selected?.incompleteSteps ? (
          <Text style={styles.warning}>
            Данные о шагах могут быть неполными: датчик недоступен, разрешение отключено или подсчёт
            прерывался системой. Проверьте разрешение на физическую активность.
          </Text>
        ) : null}
        <View style={styles.hintCard}>
          <MaterialCommunityIcons name="information-outline" size={21} color={COLORS.primary} />
          <Text style={styles.note}>
            {selected?.gpsMeters != null
              ? "Расстояние рассчитано по GPS."
              : "Расстояние приблизительное: по шагам (0,8 м), пока нет достоверного GPS."}{" "}
            Звук уведомлений зависит от системных настроек. На паузе напоминания отменяются.
          </Text>
        </View>
        <View style={styles.today}>
          <Text style={styles.todayHeading}>Сегодня вы гуляли</Text>
          <Text style={styles.todayText}>
            {formatWalkDuration(today.seconds)} · {today.steps.toLocaleString("ru-RU")} шагов ·{" "}
            {journal.completed.some(
              (w) =>
                w.gpsMeters == null &&
                w.finishedAtMs !== null &&
                new Date(w.finishedAtMs).toDateString() === new Date(nowMs).toDateString(),
            )
              ? "≈ "
              : ""}
            {formatWalkDistance(today.meters)}
          </Text>
          <Text style={styles.caption}>Завершённые прогулки на этом устройстве</Text>
        </View>
      </ScrollView>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 52, gap: 16 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#F5F0E5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DED9CC",
  },
  topTitles: { flex: 1 },
  topPaw: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#DCE2CD",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: "#777B62",
    fontSize: 10,
    fontFamily: FONTS.montserratBold,
    letterSpacing: 1.5,
    marginBottom: 1,
  },
  heading: {
    fontSize: 28,
    fontFamily: FONTS.montserratBold,
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  subheading: { fontSize: 13, color: "#777365", marginBottom: 1 },
  card: {
    padding: 16,
    borderRadius: 25,
    backgroundColor: "#F8F4EA",
    gap: 16,
    borderWidth: 1,
    borderColor: "#E4DFD2",
  },
  caption: { fontSize: 13, color: "#777468", fontWeight: "600" },
  modeRow: {
    flexDirection: "row",
    gap: 6,
    width: "100%",
    padding: 5,
    borderRadius: 17,
    backgroundColor: "#E9E8DD",
  },
  modeButton: {
    flex: 1,
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  modeSelected: { backgroundColor: COLORS.primary },
  modeLabel: { fontSize: 12, color: COLORS.text, fontWeight: "600" },
  modeSelectedLabel: { color: "#FFFFFF", fontWeight: "800" },
  minutesRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  minutesInput: {
    minWidth: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C4CDB0",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: COLORS.primaryDark,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  timerPanel: {
    borderRadius: 24,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 18,
    overflow: "hidden",
  },
  timerStatus: { flexDirection: "row", alignItems: "center", gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: "#EBD596" },
  statusDotRunning: { backgroundColor: "#BCE38C" },
  timerStatusText: {
    fontSize: 10,
    fontFamily: FONTS.montserratBold,
    letterSpacing: 1,
    color: "#F5ECCF",
  },
  timerHalo: {
    width: 208,
    height: 208,
    borderRadius: 110,
    borderWidth: 9,
    borderColor: "#A5B897",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  timer: {
    fontSize: 38,
    fontFamily: FONTS.montserratBold,
    color: "#FFF9EB",
    fontVariant: ["tabular-nums"],
    letterSpacing: -1.1,
  },
  timerHint: { fontSize: 11, color: "#E3E8D7" },
  timerWarning: { color: "#FFF0CA", fontSize: 12, textAlign: "center", lineHeight: 18 },
  metrics: { flexDirection: "row", width: "100%", gap: 9 },
  metric: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 70,
    paddingHorizontal: 5,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  value: { fontSize: 20, fontFamily: FONTS.montserratBold, color: "#FFFFFF" },
  metricCaption: { fontSize: 11, color: "#E3E8D7" },
  controls: { width: "100%", flexDirection: "row", gap: 9 },
  action: {
    flex: 1,
    minHeight: 55,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 5,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    alignItems: "center",
  },
  startButton: { backgroundColor: COLORS.primary },
  pauseButton: { backgroundColor: "#997439" },
  finishButton: { borderWidth: 1.5, borderColor: "#9AA78A", backgroundColor: "#E5EAD9" },
  buttonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  finishText: { color: COLORS.primaryDark, fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.4 },
  gpsRetry: {
    borderRadius: 14,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#BFCBAE",
    backgroundColor: "#F2F5EC",
  },
  gpsRetryText: { color: COLORS.primaryDark, fontWeight: "800", fontSize: 13 },
  warning: { fontSize: 13, color: "#845A2B", lineHeight: 20 },
  hintCard: {
    padding: 14,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#EAEBDE",
    alignItems: "flex-start",
  },
  note: { flex: 1, fontSize: 12, lineHeight: 19, color: "#666A56" },
  today: {
    backgroundColor: "#FBF8EF",
    borderRadius: 20,
    padding: 20,
    gap: 9,
    borderWidth: 1,
    borderColor: "#E5E0D4",
  },
  todayHeading: { fontFamily: FONTS.montserratBold, fontSize: 18, color: COLORS.text },
  todayText: { fontSize: 14, fontWeight: "700", color: COLORS.primaryDark },
});
