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
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native-paper";
import { TexturedSafeAreaView } from "@/shared/components";
import { COLORS, SPACING } from "@/shared/config";
import { reportClientError } from "@/shared/lib/tracer";
import { useAuthStore } from "@/shared/stores/authStore";
import {
  countdownRemainingSeconds,
  estimatedWalkMeters,
  finishWalk as finishSession,
  formatWalkDistance,
  formatWalkDuration,
  isWalkRunning,
  pauseWalk as pauseSession,
  resumeWalk,
  startWalk as beginSession,
  totalTodayWalks,
  walkDurationSeconds,
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
import { canUseDogWalkHistory } from "@/features/walk/walkAccess";
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
  const saves = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    ownerRef.current = owner;
    journalRef.current = emptyWalkJournal();
    setJournal(journalRef.current);
    setReady(false);
    if (!owner) return;
    let cancelled = false;
    void loadWalkJournal(owner)
      .then((loaded) => {
        if (cancelled || ownerRef.current !== owner) return;
        if (Platform.OS === "android" && loaded.active) {
          loaded.active = { ...loaded.active, incompleteSteps: true };
        }
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
  }, [owner]);

  const updateJournal = useCallback(
    (transform: (current: WalkJournal) => WalkJournal) => {
      if (!ownerRef.current || !ready) return;
      const actor = ownerRef.current;
      const next = transform(journalRef.current);
      if (next === journalRef.current) return;
      journalRef.current = next;
      setJournal(next);
      saves.current = saves.current
        .catch(() => undefined)
        .then(async () => {
          await saveWalkJournal(actor, next);
          if (ownerRef.current === actor) {
            await publishWalkWidgetSnapshot(
              next.active ?? next.completed[0] ?? null,
              Date.now(),
              next.preference.mode,
            );
          }
        })
        .catch((error: unknown) => reportClientError(error, { issueKey: "DogWalkSave" }));
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
    let removeSteps: (() => void) | null = null;
    let polling: ReturnType<typeof setInterval> | null = null;
    let lastCumulative: number | null = null;
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
    const startSensor = async () => {
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
        if (Platform.OS === "ios") {
          await readIosSteps();
          polling = setInterval(() => {
            void readIosSteps();
          }, 15_000);
        } else if (Platform.OS === "android") {
          const sub = Pedometer.watchStepCount(({ steps }) => {
            if (cancelled || !Number.isFinite(steps)) return;
            const value = Math.max(0, Math.floor(steps));
            if (lastCumulative === null) {
              lastCumulative = value;
              return;
            }
            const delta = Math.max(0, value - lastCumulative);
            lastCumulative = value;
            if (delta > 0)
              updateActive((walk) =>
                isWalkRunning(walk) ? { ...walk, steps: walk.steps + delta } : walk,
              );
          });
          removeSteps = () => sub.remove();
        }
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
      if (state !== "active" && Platform.OS === "android") {
        updateActive((walk) => (walk.incompleteSteps ? walk : { ...walk, incompleteSteps: true }));
      }
      if (state === "active" && Platform.OS === "ios") void readIosSteps();
    });
    return () => {
      cancelled = true;
      removeSteps?.();
      if (polling) clearInterval(polling);
      appSub.remove();
    };
    // Re-subscribe only for new walking segments, not on every pedometer sample.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, owner, active?.startedAtMs, active?.runningSinceMs, running, updateActive]);

  const captureSegmentSteps = useCallback(async (walk: DogWalk, now: number): Promise<DogWalk> => {
    if (Platform.OS !== "ios" || !isWalkRunning(walk)) return walk;
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
  }, []);

  const notify = useCallback(async (actor: string, walk: DogWalk | null, granted: boolean) => {
    try {
      await syncWalkNotifications(actor, walk, granted);
    } catch (error) {
      reportClientError(error, { issueKey: "DogWalkReminderSchedule" });
      setNotice("Не удалось настроить напоминания. Прогулку можно продолжать без уведомлений.");
    }
  }, []);

  const performAction = useCallback(
    async (request: WalkAction) => {
      if (!ready || !owner || ownerRef.current !== owner || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const current = journalRef.current.active;
        if (request === "start") {
          if (current && isWalkRunning(current)) return;
          let notificationsGranted = false;
          try {
            notificationsGranted = await configureWalkAlertPermission();
            if (!notificationsGranted) {
              setNotice("Для сигнала таймера и напоминаний разрешите уведомления GAFUS.");
            }
          } catch (error) {
            reportClientError(error, { issueKey: "DogWalkNotificationPermissions" });
          }
          if (ownerRef.current !== owner) return;
          if (current) {
            const resumed: DogWalk = {
              ...resumeWalk(current, Date.now()),
              stepBaselineAtResume: current.steps,
            };
            updateJournal((state) =>
              state.active?.startedAtMs === current.startedAtMs
                ? { ...state, active: resumed }
                : state,
            );
            await notify(owner, resumed, notificationsGranted);
            return;
          }
          let incompleteSteps = false;
          try {
            const available = await Pedometer.isAvailableAsync();
            const permission = available ? await Pedometer.requestPermissionsAsync() : null;
            incompleteSteps = !available || !permission?.granted;
          } catch (error) {
            incompleteSteps = true;
            reportClientError(error, { issueKey: "DogWalkStepPermissions" });
          }
          if (ownerRef.current !== owner) return;
          const preference = journalRef.current.preference;
          const walk = {
            ...beginSession(preference.mode, Date.now(), preference.countdownMinutes * 60),
            clientId: Crypto.randomUUID(),
            incompleteSteps,
          };
          updateJournal((state) => (state.active ? state : { ...state, active: walk }));
          await notify(owner, walk, notificationsGranted);
        } else if (current) {
          if (request === "pause" && !isWalkRunning(current)) return;
          const now = Date.now();
          const captured = await captureSegmentSteps(current, now);
          if (ownerRef.current !== owner) return;
          if (request === "pause") {
            const paused = pauseSession(captured, now);
            updateJournal((state) =>
              state.active?.startedAtMs === current.startedAtMs
                ? { ...state, active: paused }
                : state,
            );
          } else {
            const completed = finishSession(captured, now);
            updateJournal((state) =>
              state.active?.startedAtMs === current.startedAtMs
                ? {
                    ...state,
                    active: null,
                    completed: [completed, ...state.completed].slice(0, 2000),
                  }
                : state,
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
    [ready, owner, updateJournal, notify, captureSegmentSteps],
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
    void performAction(action).finally(() => router.setParams({ action: "" }));
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
  const selected = active ?? journal.completed[0] ?? null;
  const mode = active?.mode ?? journal.preference.mode;
  const seconds = selected
    ? mode === "countdown"
      ? countdownRemainingSeconds(selected, nowMs)
      : walkDurationSeconds(selected, nowMs)
    : 0;
  const today = totalTodayWalks(journal.completed, nowMs);

  return (
    <TexturedSafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
        >
          <Text style={styles.back}>← Назад</Text>
        </Pressable>
        <Text style={styles.heading}>Прогулка с собакой</Text>
        <Text style={styles.subheading}>Время, шаги и приблизительное расстояние</Text>
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
          <Text style={styles.caption}>
            {!active ? "Таймер прогулки" : running ? "Гуляем сейчас" : "Прогулка на паузе"}
          </Text>
          <Text style={styles.timer}>{formatWalkDuration(seconds)}</Text>
          {active?.mode === "countdown" && seconds === 0 ? (
            <Text style={styles.warning}>Время вышло. Можно продолжить прогулку.</Text>
          ) : null}
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.value}>{selected?.steps.toLocaleString("ru-RU") ?? "0"}</Text>
              <Text style={styles.caption}>шагов</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.value}>
                ≈ {formatWalkDistance(estimatedWalkMeters(selected?.steps ?? 0))}
              </Text>
              <Text style={styles.caption}>расстояние</Text>
            </View>
          </View>
          {!ready ? (
            <Text style={styles.note}>Загрузка прогулок…</Text>
          ) : (
            <View style={styles.controls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={active ? "Продолжить прогулку" : "Начать прогулку"}
                disabled={busy || running}
                onPress={() => {
                  void performAction("start");
                }}
                style={[styles.action, styles.startButton, (busy || running) && styles.disabled]}
              >
                <Text style={styles.buttonText}>{active ? "▶ Продолжить" : "▶ Старт"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Пауза прогулки"
                disabled={busy || !running}
                onPress={() => {
                  void performAction("pause");
                }}
                style={[styles.action, styles.pauseButton, (busy || !running) && styles.disabled]}
              >
                <Text style={styles.buttonText}>Ⅱ Пауза</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Завершить прогулку"
                disabled={busy || !active}
                onPress={() => {
                  void performAction("finish");
                }}
                style={[styles.action, styles.finishButton, (busy || !active) && styles.disabled]}
              >
                <Text style={styles.buttonText}>■ Конец</Text>
              </Pressable>
            </View>
          )}
        </View>
        {notice ? <Text style={styles.warning}>{notice}</Text> : null}
        {selected?.incompleteSteps ? (
          <Text style={styles.warning}>
            Данные о шагах могут быть неполными: Android не гарантирует их учёт при свёрнутом
            приложении.
          </Text>
        ) : null}
        <Text style={styles.note}>
          Расстояние оценивается по средней длине шага (0,8 м), без GPS. Звук уведомлений зависит от
          системных настроек. На паузе напоминания отменяются.
        </Text>
        <View style={styles.today}>
          <Text style={styles.todayHeading}>Сегодня вы гуляли</Text>
          <Text style={styles.todayText}>
            {formatWalkDuration(today.seconds)} · {today.steps.toLocaleString("ru-RU")} шагов · ≈{" "}
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
  content: { padding: SPACING.lg, paddingBottom: 40, gap: 16 },
  back: { fontSize: 15, color: COLORS.primary },
  heading: { fontSize: 27, fontWeight: "700", color: COLORS.text },
  subheading: { fontSize: 14, color: COLORS.textSecondary },
  card: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: COLORS.cardBackground,
    alignItems: "center",
    gap: 18,
  },
  caption: { fontSize: 13, color: COLORS.textSecondary },
  timer: { fontSize: 44, fontWeight: "700", color: COLORS.text, fontVariant: ["tabular-nums"] },
  modeRow: { flexDirection: "row", gap: 8, width: "100%" },
  modeButton: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#E8E7DD",
    alignItems: "center",
  },
  modeSelected: { backgroundColor: COLORS.primary },
  modeLabel: { fontSize: 13, color: COLORS.text },
  modeSelectedLabel: { color: "#FFFFFF", fontWeight: "700" },
  minutesRow: { width: "100%", alignItems: "center", gap: 8 },
  minutesInput: {
    minWidth: 90,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingVertical: 8,
    paddingHorizontal: 16,
    color: COLORS.text,
    textAlign: "center",
    fontSize: 18,
  },
  metrics: { flexDirection: "row", width: "100%", justifyContent: "space-around" },
  metric: { alignItems: "center", gap: 5 },
  value: { fontSize: 21, fontWeight: "700", color: COLORS.text },
  controls: { width: "100%", flexDirection: "row", gap: 6 },
  action: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  startButton: { backgroundColor: COLORS.primary },
  pauseButton: { backgroundColor: "#9C812F" },
  finishButton: { backgroundColor: "#57664C" },
  buttonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  warning: { fontSize: 13, color: "#8F5D20", lineHeight: 20 },
  note: { fontSize: 12, lineHeight: 18, color: COLORS.textSecondary },
  today: { backgroundColor: COLORS.cardBackground, borderRadius: 18, padding: 18, gap: 7 },
  todayHeading: { fontWeight: "700", fontSize: 17, color: COLORS.text },
  todayText: { fontSize: 15, color: COLORS.text },
});
