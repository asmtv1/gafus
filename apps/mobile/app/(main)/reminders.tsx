import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui";
import { Snackbar, Switch, Text } from "react-native-paper";
import { Image } from "expo-image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useFocusEffect, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BORDER_RADIUS, COLORS, FONTS, SPACING } from "@/shared/config";
import { remindersApi, type Reminder, type ReminderPayload, type ReminderUpdatePayload } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { trackEvent } from "@/shared/lib/analytics";
import { reportClientError } from "@/shared/lib/tracer";
import {
  getPushPermissionStatus,
  getVerifiedPushActor,
  isSameVerifiedPushActor,
  markPushPermissionEducationSeen,
  setupPushNotifications,
  shouldShowPushPermissionEducation,
} from "@/shared/lib/utils/notifications";
import type { PushActor } from "@/shared/lib/utils/pushRegistrationOwner";
import type { ReminderV2ReviewCandidate } from "@/features/reminders/reminderV2Candidate";
import type { ReminderV49AG4Review } from "@/features/reminders/reminderV49AG4Compat.review";
import { pushDeviceStatusForActor } from "@/shared/lib/api/profileTabQueries";
import { usePushRegistrationLiveness } from "@/shared/lib/utils/usePushRegistrationLiveness";

const DAYS_OF_WEEK = [
  { id: "1", label: "Пн" },
  { id: "2", label: "Вт" },
  { id: "3", label: "Ср" },
  { id: "4", label: "Чт" },
  { id: "5", label: "Пт" },
  { id: "6", label: "Сб" },
  { id: "7", label: "Вс" },
] as const;

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const ITEM_H = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_H * VISIBLE_ITEMS;

function formatReminderDaysLabel(reminderDays: string | null): string {
  if (!reminderDays?.trim()) return "каждый день";
  const ids = reminderDays
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const labels = ids.map((id) => DAYS_OF_WEEK.find((d) => d.id === id)?.label ?? id);
  return labels.join(", ");
}

function reminderDaysForCreate(allDays: boolean, selectedDays: string[]): string | null {
  if (allDays) return null;
  if (selectedDays.length === 0) return null;
  return [...selectedDays].sort((a, b) => Number(a) - Number(b)).join(",");
}

/** IANA timezone устройства для совпадения «16:00» с локальными часами пользователя */
function getDeviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && typeof tz === "string") {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    }
  } catch {
    /* fallthrough */
  }
  return "Europe/Moscow";
}

interface ScrollColumnProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function ScrollColumn({ items, selectedIndex, onSelect }: ScrollColumnProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(id);
    // intentionally run only on mount — не реагируем на изменения извне
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      onSelect(clamped);
    },
    [items.length, onSelect],
  );

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      nestedScrollEnabled
      scrollEventThrottle={16}
      style={styles.pickerColumn}
      contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
      onMomentumScrollEnd={handleScrollEnd}
      onScrollEndDrag={handleScrollEnd}
    >
      {items.map((item, i) => {
        const isSelected = i === selectedIndex;
        return (
          <View key={item} style={styles.pickerItem}>
            <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}>
              {item}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function RemindersScreen() {
  const segments = useSegments();
  // Old /reminders links should also open inside the shared tab navigator.
  return segments.some((segment) => segment === "(tabs)") ? (
    <RemindersContent />
  ) : (
    <Redirect href="/(main)/(tabs)/reminders" />
  );
}

/** AG4 source/mock consumer admission only: injected review candidate uses no real wire. */
export function RemindersV2ReviewScreen({ candidate }: { candidate: ReminderV2ReviewCandidate }) {
  return <RemindersContent reviewCandidate={candidate} />;
}
/** Review-only injection. NEVER used by default RemindersScreen. */
export function RemindersV49AG4ReviewScreen({ candidate }: { candidate: ReminderV49AG4Review }) {
  return <RemindersContent durableReviewCandidate={candidate} />;
}
function RemindersContent({
  reviewCandidate,
  durableReviewCandidate,
}: {
  reviewCandidate?: ReminderV2ReviewCandidate;
  durableReviewCandidate?: ReminderV49AG4Review;
} = {}) {
  const injectedCandidate = durableReviewCandidate ?? reviewCandidate;
  const queryClient = useQueryClient();
  const isPushScreenLive = usePushRegistrationLiveness();
  const reminderCreateActor = useRef<PushActor | null>(null);
  const writeInFlight = useRef(false);
  const [needsManualReview, setNeedsManualReview] = useState(
    () => injectedCandidate?.state() === "unknown" || injectedCandidate?.state() === "terminal",
  );
  const actor = getVerifiedPushActor();
  const current = (captured: PushActor | null) =>
    isPushScreenLive() && isSameVerifiedPushActor(captured);
  const [durableHydrated, setDurableHydrated] = useState(!durableReviewCandidate);
  const liveRef = useRef(isPushScreenLive);
  liveRef.current = isPushScreenLive;
  useEffect(() => {
    if (!durableReviewCandidate) return;
    let active = true;
    const captured = getVerifiedPushActor();
    setDurableHydrated(false);
    if (!captured)
      return () => {
        active = false;
      };
    void durableReviewCandidate
      .restore(captured, () => liveRef.current() && isSameVerifiedPushActor(captured))
      .then((state) => {
        if (!active || !liveRef.current() || !isSameVerifiedPushActor(captured)) return;
        setDurableHydrated(true);
        if (state !== "idle") setNeedsManualReview(true);
      });
    return () => {
      active = false;
    };
  }, [durableReviewCandidate, actor?.ownerId, actor?.authEpoch]);
  const queryKey = ["reminders", actor?.ownerId ?? null, actor?.authEpoch ?? null] as const;
  const readOwnList = async (captured: PushActor | null): Promise<Reminder[]> => {
    if (!current(captured)) throw new Error("REMINDER_SESSION_CHANGED");
    const result = await remindersApi.getAll(() => current(captured));
    if (!current(captured)) throw new Error("REMINDER_SESSION_CHANGED");
    if (!result.success || !Array.isArray(result.data))
      throw new Error("REMINDER_READBACK_UNKNOWN");
    return result.data;
  };
  const verifyOwnWrite = async (captured: PushActor | null) => {
    const rows = await readOwnList(captured);
    if (!current(captured)) throw new Error("REMINDER_SESSION_CHANGED");
    queryClient.setQueryData(["reminders", captured?.ownerId, captured?.authEpoch], rows);
    return rows;
  };
  const unknownMessage =
    "Статус изменения неизвестен. Проверьте список; повторная отправка отключена.";

  const [name, setName] = useState("");
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [allDays, setAllDays] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  // Existing Hono PUT supports full edits; do not create a second reminder.
  const [editing, setEditing] = useState<{ row: Reminder; actor: PushActor } | null>(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const [deviceTimeZone, setDeviceTimeZone] = useState(() => getDeviceTimeZone());
  const [showPushEducation, setShowPushEducation] = useState(false);
  const [isEnablingPush, setIsEnablingPush] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setDeviceTimeZone(getDeviceTimeZone());
    }, []),
  );

  const timeString = `${HOURS[selectedHour]}:${MINUTES[selectedMinute]}`;

  const remindersQuery = useQuery({
    queryKey,
    enabled: Boolean(actor),
    queryFn: () => readOwnList(actor),
    retry: false,
  });

  const reminders = useMemo(() => remindersQuery.data ?? [], [remindersQuery.data]);
  const activeEdit = editing && current(editing.actor) &&
    reminders.some((row) => row.id === editing.row.id) ? editing : null;
  const formTimezone = activeEdit?.row.timezone ?? deviceTimeZone;
  useEffect(() => {
    // Auth epoch and mounted account changed; old draft must never mutate B.
    setEditing(null);
    setName("");
    setSelectedDays([]);
    setAllDays(false);
  }, [actor?.ownerId, actor?.authEpoch]);
  const readyToWrite =
    Boolean(actor) &&
    remindersQuery.isSuccess &&
    !writeInFlight.current &&
    !needsManualReview &&
    durableHydrated &&
    (!injectedCandidate || injectedCandidate.state() === "idle");

  type CreateAction = { actor: PushActor; payload: ReminderPayload };
  type UpdateAction = {
    actor: PushActor; id: string; changes: ReminderUpdatePayload;
    editing: boolean;
  };
  type DeleteAction = { actor: PushActor; id: string };

  const markUnknown = (captured: PushActor) => {
    if (!current(captured)) return;
    setNeedsManualReview(true);
    setSnackbar({ visible: true, message: unknownMessage });
  };

  const createMutation = useMutation({
    mutationFn: ({ actor: captured, payload }: CreateAction) =>
      remindersApi.create(payload, () => current(captured)),
    onSuccess: async (res, action) => {
      const captured = action.actor;
      if (!current(captured)) return;
      if (!res.success || !res.data?.id) {
        markUnknown(captured);
        return;
      }
      try {
        const rows = await verifyOwnWrite(captured);
        if (!current(captured)) return;
        const same = rows.find((row) => row.id === res.data?.id);
        if (
          !same ||
          same.name !== action.payload.name ||
          same.reminderTime !== action.payload.reminderTime ||
          same.reminderDays !== (action.payload.reminderDays ?? null) ||
          same.timezone !== action.payload.timezone
        ) {
          markUnknown(captured);
          return;
        }
        setName("");
        setSelectedHour(9);
        setSelectedMinute(0);
        setAllDays(false);
        setSelectedDays([]);
        trackEvent({
          eventName: "button_click",
          platform: "mobile",
          pathOrScreen: "/reminders",
          elementId: "training-reminder-create-success",
        });
        void hapticFeedback.success();
        setSnackbar({ visible: true, message: "Напоминание добавлено" });

        const permissionStatus = await getPushPermissionStatus();
        if (!current(captured)) return;
        if (permissionStatus === "granted") {
          void setupPushNotifications({ isLive: isPushScreenLive });
        } else if (await shouldShowPushPermissionEducation()) {
          if (current(captured)) setShowPushEducation(true);
        }
      } catch {
        reportClientError(new Error("REMINDER_CREATE_READBACK_UNKNOWN"), {
          issueKey: "RemindersScreen",
          keys: { operation: "create_readback" },
        });
        markUnknown(captured);
      }
    },
    onError: (_error, action) => markUnknown(action.actor),
    onSettled: () => {
      writeInFlight.current = false;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ actor: captured, id, changes }: UpdateAction) =>
      remindersApi.update(id, changes, () => current(captured)),
    onSuccess: async (res, action) => {
      if (!current(action.actor)) return;
      if (!res.success) return markUnknown(action.actor);
      try {
        const rows = await verifyOwnWrite(action.actor);
        if (!current(action.actor)) return;
        const item = rows.find((row) => row.id === action.id);
        if (!item || Object.entries(action.changes).some(([key, value]) =>
          item[key as keyof Reminder] !== value)) return markUnknown(action.actor);
        if (action.editing) {
          setEditing(null);
          setName("");
          setSelectedHour(9);
          setSelectedMinute(0);
          setAllDays(false);
          setSelectedDays([]);
          setSnackbar({ visible: true, message: "Напоминание обновлено" });
        }
      } catch {
        reportClientError(new Error("REMINDER_UPDATE_READBACK_UNKNOWN"), {
          issueKey: "RemindersScreen",
          keys: { operation: "update_readback" },
        });
        markUnknown(action.actor);
      }
    },
    onError: (_error, action) => markUnknown(action.actor),
    onSettled: () => {
      writeInFlight.current = false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ actor: captured, id }: DeleteAction) =>
      remindersApi.remove(id, () => current(captured)),
    onSuccess: async (res, action) => {
      if (!current(action.actor)) return;
      if (!res.success) return markUnknown(action.actor);
      try {
        const rows = await verifyOwnWrite(action.actor);
        if (!current(action.actor)) return;
        if (rows.some((row) => row.id === action.id)) return markUnknown(action.actor);
        setSnackbar({ visible: true, message: "Напоминание удалено" });
      } catch {
        reportClientError(new Error("REMINDER_DELETE_READBACK_UNKNOWN"), {
          issueKey: "RemindersScreen",
          keys: { operation: "delete_readback" },
        });
        markUnknown(action.actor);
      }
    },
    onError: (_error, action) => markUnknown(action.actor),
    onSettled: () => {
      writeInFlight.current = false;
    },
  });

  const handleStartEdit = (row: Reminder) => {
    if (!actor || !current(actor) || !readyToWrite || remindersQuery.isFetching ||
      injectedCandidate || !/^[0-9]{2}:[0-9]{2}$/.test(row.reminderTime)) return;
    const [hh, mm] = row.reminderTime.split(":").map(Number);
    if (hh === undefined || mm === undefined || hh < 0 || hh > 23 ||
      mm < 0 || mm > 59 || !row.timezone.trim()) return;
    setEditing({ row, actor });
    setName(row.name);
    setSelectedHour(hh);
    setSelectedMinute(mm);
    setAllDays(row.reminderDays == null);
    setSelectedDays(row.reminderDays?.split(",") ?? []);
    setShowTimePicker(false);
  };
  const handleCancelEdit = () => {
    if (writeInFlight.current) return;
    setEditing(null);
    setName("");
    setSelectedHour(9);
    setSelectedMinute(0);
    setAllDays(false);
    setSelectedDays([]);
  };
  const handleSaveEdit = () => {
    if (!activeEdit || !actor || !current(activeEdit.actor) ||
      !readyToWrite || writeInFlight.current || remindersQuery.isFetching) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100 ||
      (!allDays && selectedDays.length === 0)) {
      setSnackbar({visible: true, message: "Проверьте название и дни недели"});
      return;
    }
    const changes: ReminderUpdatePayload = {
      name: trimmed, reminderTime: timeString,
      reminderDays: reminderDaysForCreate(allDays, selectedDays),
      timezone: formTimezone,
    };
    if (trimmed === activeEdit.row.name && timeString === activeEdit.row.reminderTime &&
      changes.reminderDays === activeEdit.row.reminderDays &&
      formTimezone === activeEdit.row.timezone) {
      handleCancelEdit();
      return;
    }
    writeInFlight.current = true;
    updateMutation.mutate({ actor: activeEdit.actor, id: activeEdit.row.id,
      changes, editing: true });
  };

  const handleToggleAllDays = () => {
    void hapticFeedback.selection();
    const next = !allDays;
    setAllDays(next);
    if (next) setSelectedDays([]);
  };

  const handleDayChipPress = (dayId: string) => {
    void hapticFeedback.selection();
    if (allDays) {
      setAllDays(false);
      setSelectedDays([dayId]);
      return;
    }
    setSelectedDays((prev) => {
      const next = prev.includes(dayId)
        ? prev.filter((d) => d !== dayId)
        : [...prev, dayId].sort((a, b) => Number(a) - Number(b));
      return next;
    });
  };

  const handleCreate = () => {
    // Ref is checked at event time: a second synchronous tap sees it before React rerenders.
    if (
      !actor ||
      !current(actor) ||
      writeInFlight.current ||
      needsManualReview ||
      !remindersQuery.isSuccess || !!activeEdit
    )
      return;
    if (!name.trim()) {
      setSnackbar({ visible: true, message: "Введите название напоминания" });
      return;
    }
    if (reminders.length >= 5) {
      setSnackbar({ visible: true, message: "Максимум 5 напоминаний" });
      return;
    }
    if (!allDays && selectedDays.length === 0) {
      setSnackbar({
        visible: true,
        message: "Выберите дни недели или включите «Все дни»",
      });
      return;
    }

    if (injectedCandidate) {
      // REVIEW_ONLY: same existing mounted form, injected synthetic V2/V49 transport.
      // Never call legacy remindersApi.create as fallback from this branch.
      const captured = actor;
      const guard = () => current(captured);
      const payload: ReminderPayload = {
        name: name.trim(),
        reminderTime: timeString,
        reminderDays: reminderDaysForCreate(allDays, selectedDays),
        timezone: deviceTimeZone,
      };
      writeInFlight.current = true;
      void (async () => {
        try {
          const outcome = await injectedCandidate.create(captured, payload, guard);
          if (!guard()) return;
          if (outcome.kind === "acknowledged") {
            try {
              const rows = await verifyOwnWrite(captured);
              if (!guard()) return;
              const verified = await injectedCandidate.confirmList(captured, rows, guard);
              if (verified.kind === "confirmed") {
                setName("");
                setSelectedHour(9);
                setSelectedMinute(0);
                setAllDays(false);
                setSelectedDays([]);
                setSnackbar({ visible: true, message: "Напоминание добавлено" });
              } else {
                markUnknown(captured);
              }
            } catch {
              reportClientError(new Error("REMINDER_V2_ACK_READBACK_UNKNOWN"), {
                issueKey: "RemindersScreen",
                keys: { operation: "v2_ack_readback" },
              });
              injectedCandidate.markReadbackUnknown(captured, guard);
              markUnknown(captured);
            }
          } else if (outcome.kind === "rejected") {
            setSnackbar({ visible: true, message: "Максимум 5 напоминаний" });
          } else if (outcome.kind === "terminal") {
            setNeedsManualReview(true);
            setSnackbar({
              visible: true,
              message: "Конфликт операции. Повторная отправка заблокирована.",
            });
          } else if (outcome.kind === "unknown") {
            markUnknown(captured);
          } else if (durableReviewCandidate && outcome.kind === "blocked") {
            setNeedsManualReview(true);
            setSnackbar({
              visible: true,
              message: "Невозможно безопасно сохранить операцию. Отправка заблокирована.",
            });
          }
        } finally {
          if (guard()) writeInFlight.current = false;
        }
      })();
      return;
    }
    reminderCreateActor.current = actor;
    writeInFlight.current = true;
    createMutation.mutate({
      actor,
      payload: {
        name: name.trim(),
        reminderTime: timeString,
        reminderDays: reminderDaysForCreate(allDays, selectedDays),
        timezone: deviceTimeZone,
      },
    });
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/reminders",
      elementId: "training-reminder-create-submit",
    });
  };

  const handleSkipPushEducation = async () => {
    // Education belongs to the author of the confirmed reminder, not the next login.
    const actor = reminderCreateActor.current;
    await markPushPermissionEducationSeen();
    if (!isPushScreenLive() || !isSameVerifiedPushActor(actor)) return;
    setShowPushEducation(false);
    setSnackbar({
      visible: true,
      message: "Напоминание сохранено, но уведомления пока выключены",
    });
  };

  const handleEnablePush = async () => {
    if (isEnablingPush) return;
    const actor = reminderCreateActor.current;
    setIsEnablingPush(true);
    try {
      await markPushPermissionEducationSeen();
      if (!isPushScreenLive() || !isSameVerifiedPushActor(actor)) return;
      const ok = await setupPushNotifications({ isLive: isPushScreenLive });
      if (!isPushScreenLive() || !isSameVerifiedPushActor(actor)) return;
      let confirmed = false;
      if (ok) {
        try {
          const status = await queryClient.fetchQuery(pushDeviceStatusForActor(actor));
          confirmed = status.determined && status.hasThisDeviceSubscription;
        } catch {
          // A lost status ACK is not evidence that delivery has been enabled.
        }
      }
      if (!isPushScreenLive() || !isSameVerifiedPushActor(actor)) return;
      setShowPushEducation(false);
      setSnackbar({
        visible: true,
        message: confirmed
          ? "Уведомления включены — напомним о тренировке вовремя"
          : ok
            ? "Регистрация отправлена. Проверьте статус уведомлений в профиле"
            : "Не удалось подтвердить включение. Это можно сделать позже в профиле",
      });
    } finally {
      if (isPushScreenLive()) setIsEnablingPush(false);
    }
  };

  return (
    <>
      <SafeAreaView style={styles.container} edges={[]}>
        <StatusBar style="dark" translucent backgroundColor="transparent" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Image
            source={require("../../assets/images/reminders-header.webp")}
            style={styles.headerImage}
            contentFit="contain"
            accessible
            accessibilityLabel="Напоминания. Настройте время и не пропускайте важное"
          />
          <View style={styles.formCard}>
            <TextInput
              value={name}
              onChangeText={setName}
              editable={!createMutation.isPending && !updateMutation.isPending &&
                !deleteMutation.isPending && !needsManualReview}
              style={styles.input}
              placeholder="Название напоминания"
              placeholderTextColor={COLORS.disabled}
              maxLength={100}
            />

            <Text style={styles.fieldLabel}>Время</Text>
            <Pressable
              style={styles.timeField}
              disabled={createMutation.isPending || updateMutation.isPending ||
                deleteMutation.isPending || needsManualReview}
              onPress={() => setShowTimePicker(true)}
              accessibilityRole="button"
              accessibilityLabel={`Выбрать время: ${timeString}`}
            >
              <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.primary} />
              <Text style={styles.timeFieldText}>{timeString}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={COLORS.disabled} />
            </Pressable>
            <Text style={styles.timezoneHint}>
              {activeEdit ? "Часовой пояс напоминания" : "По времени телефона"}
              {" "}({formTimezone.replace(/_/g, " ")})
            </Text>

            <Text style={styles.fieldLabel}>Дни недели</Text>

            <Pressable
              style={[styles.allDaysToggle, allDays && styles.allDaysToggleActive]}
              disabled={createMutation.isPending || updateMutation.isPending ||
                deleteMutation.isPending || needsManualReview}
              onPress={handleToggleAllDays}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allDays }}
            >
              <MaterialCommunityIcons
                name={allDays ? "checkbox-marked" : "checkbox-blank-outline"}
                size={20}
                color={allDays ? COLORS.onPrimary : COLORS.primary}
              />
              <Text style={[styles.allDaysText, allDays && styles.allDaysTextActive]}>Все дни</Text>
            </Pressable>

            <View style={styles.daysRow}>
              {DAYS_OF_WEEK.map((day) => {
                const selected = !allDays && selectedDays.includes(day.id);
                return (
                  <Pressable
                    key={day.id}
                    disabled={createMutation.isPending || updateMutation.isPending ||
                deleteMutation.isPending || needsManualReview}
                    onPress={() => handleDayChipPress(day.id)}
                    style={[
                      styles.dayChip,
                      selected && styles.dayChipSelected,
                      allDays && styles.dayChipDisabled,
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${day.label}, ${selected ? "выбран" : "не выбран"}`}
                  >
                    <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>
                      {day.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Button
              label={activeEdit
                ? (updateMutation.isPending ? "Сохранение..." : "Сохранить изменения")
                : (createMutation.isPending ? "Добавление..." : "Добавить")}
              onPress={activeEdit ? handleSaveEdit : handleCreate}
              disabled={!readyToWrite || createMutation.isPending ||
                updateMutation.isPending || deleteMutation.isPending}
            />
            {activeEdit && <Button
              label="Отменить редактирование"
              onPress={handleCancelEdit}
              disabled={updateMutation.isPending || needsManualReview}
            />}
            {needsManualReview && (
              <Text style={styles.timezoneHint}>
                {durableReviewCandidate &&
                ["blocked", "quarantined", "unchecked"].includes(durableReviewCandidate.state())
                  ? "Безопасное создание недоступно: проверьте хранилище или текущую сессию. Повторная отправка запрещена."
                  : durableReviewCandidate?.state() === "server_committed_unverified_draft"
                    ? "Сервер подтвердил создание напоминания. Исходные поля после перезапуска не проверены."
                    : unknownMessage}
              </Text>
            )}
            {injectedCandidate && needsManualReview && injectedCandidate.state() === "unknown" && (
              <Button
                label="Проверить операцию"
                onPress={() => {
                  if (!actor || !current(actor) || writeInFlight.current) return;
                  const captured = actor;
                  writeInFlight.current = true;
                  void (async () => {
                    try {
                      const looked = await injectedCandidate.manualLookup(captured, () =>
                        current(captured),
                      );
                      if (!current(captured)) return;
                      if (looked.kind === "confirmed") {
                        // Lookup alone is not proof our current owner list already
                        // reflects the receipt; preserve exact ordinary readback.
                        try {
                          const rows = await verifyOwnWrite(captured);
                          if (!current(captured)) return;
                          if (rows.some((row) => row.id === looked.reminder.id)) {
                            setNeedsManualReview(false);
                            setSnackbar({ visible: true, message: "Напоминание подтверждено" });
                          } else {
                            injectedCandidate.markReadbackUnknown(captured, () =>
                              current(captured),
                            );
                            markUnknown(captured);
                          }
                        } catch {
                          reportClientError(new Error("REMINDER_V2_LOOKUP_READBACK_UNKNOWN"), {
                            issueKey: "RemindersScreen",
                            keys: { operation: "v2_lookup_readback" },
                          });
                          injectedCandidate.markReadbackUnknown(captured, () => current(captured));
                          markUnknown(captured);
                        }
                      } else if (looked.kind === "server_committed_unverified_draft") {
                        // Owner+key proof only: NEVER label exact user-entered
                        // fields or clear the terminal journal based on this DTO.
                        setNeedsManualReview(true);
                        setSnackbar({
                          visible: true,
                          message: "Сервер подтвердил создание. Исходные поля не проверены.",
                        });
                      } else if (looked.kind === "blocked" && durableReviewCandidate) {
                        setNeedsManualReview(true);
                        setSnackbar({
                          visible: true,
                          message:
                            "Не удалось надёжно сохранить результат. Статус операции неизвестен.",
                        });
                      } else if (looked.kind === "gated") {
                        setSnackbar({
                          visible: true,
                          message: "Проверка недоступна до разрешения AG4.",
                        });
                      } else if (looked.kind === "unknown") markUnknown(captured);
                    } finally {
                      if (current(captured)) writeInFlight.current = false;
                    }
                  })();
                }}
                disabled={!actor || !current(actor)}
              />
            )}
            {remindersQuery.isError && (
              <Text style={styles.timezoneHint}>
                Не удалось проверить список напоминаний. Повторная отправка не выполнена.
              </Text>
            )}
          </View>

          {reminders.length > 0 && (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Список напоминаний</Text>
              {reminders.map((r: Reminder) => (
                <View key={r.id} style={styles.item}>
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemName}>{r.name}</Text>
                    <Text style={styles.itemDetail}>
                      {r.reminderTime} • {formatReminderDaysLabel(r.reminderDays)}
                    </Text>
                  </View>
                  <Switch
                    value={r.enabled}
                    color={COLORS.primary}
                    disabled={!readyToWrite || !!activeEdit ||
                      updateMutation.isPending || deleteMutation.isPending}
                    onValueChange={(enabled) => {
                      if (
                        !actor ||
                        !current(actor) ||
                        writeInFlight.current ||
                        needsManualReview ||
                        !remindersQuery.isSuccess
                      )
                        return;
                      writeInFlight.current = true;
                      void hapticFeedback.selection();
                      trackEvent({
                        eventName: "button_click",
                        platform: "mobile",
                        pathOrScreen: "/reminders",
                        elementId: enabled
                          ? "training-reminder-enabled"
                          : "training-reminder-disabled",
                      });
                      updateMutation.mutate({ actor, id: r.id,
                        changes: { enabled }, editing: false });
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Изменить напоминание: ${r.name}`}
                    disabled={!readyToWrite || !!activeEdit ||
                      updateMutation.isPending || deleteMutation.isPending}
                    onPress={() => handleStartEdit(r)}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={18}
                      color={COLORS.primary} />
                  </Pressable>
                  <Pressable
                    style={styles.deleteBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Удалить напоминание: ${r.name}`}
                    disabled={!readyToWrite || !!activeEdit ||
                      updateMutation.isPending || deleteMutation.isPending}
                    onPress={() => {
                      if (
                        !actor ||
                        !current(actor) ||
                        writeInFlight.current ||
                        needsManualReview ||
                        !remindersQuery.isSuccess
                      )
                        return;
                      void hapticFeedback.light();
                      Alert.alert("Удалить напоминание", "Вы уверены?", [
                        { text: "Отмена", style: "cancel" },
                        {
                          text: "Удалить",
                          style: "destructive",
                          onPress: () => {
                            if (!current(actor) || writeInFlight.current || needsManualReview)
                              return;
                            writeInFlight.current = true;
                            deleteMutation.mutate({ actor, id: r.id });
                          },
                        },
                      ]);
                    }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color="#B00020" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Time picker modal */}
        <Modal
          visible={showTimePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View style={styles.modalOverlay}>
            {/* Область для закрытия по тапу на фон */}
            <Pressable style={styles.modalDismissArea} onPress={() => setShowTimePicker(false)} />
            {/* Sheet — обычный View, чтобы не блокировать scroll */}
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Выберите время</Text>
                <Pressable onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.modalDone}>Готово</Text>
                </Pressable>
              </View>

              <View style={styles.pickerContainer}>
                <View style={styles.pickerHighlight} pointerEvents="none" />
                <ScrollColumn
                  items={HOURS}
                  selectedIndex={selectedHour}
                  onSelect={setSelectedHour}
                />
                <Text style={styles.pickerSeparator}>:</Text>
                <ScrollColumn
                  items={MINUTES}
                  selectedIndex={selectedMinute}
                  onSelect={setSelectedMinute}
                />
              </View>
            </View>
          </View>
        </Modal>

        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: "" })}
        >
          {snackbar.message}
        </Snackbar>

        <Modal
          visible={showPushEducation}
          transparent
          animationType="fade"
          onRequestClose={() => void handleSkipPushEducation()}
        >
          <View style={styles.pushPromptOverlay}>
            <View style={styles.pushPromptCard} accessibilityViewIsModal>
              <View style={styles.pushPromptIcon}>
                <MaterialCommunityIcons name="bell-ring-outline" size={30} color={COLORS.primary} />
              </View>
              <Text style={styles.pushPromptTitle}>Напомнить о тренировке?</Text>
              <Text style={styles.pushPromptText}>
                Разрешите уведомления, чтобы мы прислали напоминание в выбранное вами время.
              </Text>
              <Button
                label={isEnablingPush ? "Включаем..." : "Разрешить уведомления"}
                height={52}
                fontFamily={FONTS.montserratBold}
                fontSize={16}
                lineHeight={21}
                horizontalPadding={SPACING.md}
                verticalPadding={0}
                borderRadius={BORDER_RADIUS.lg}
                loading={isEnablingPush}
                onPress={() => void handleEnablePush()}
                disabled={isEnablingPush}
                accessibilityRole="button"
                accessibilityLabel="Разрешить уведомления о тренировках"
              />
              <Pressable
                style={styles.pushPromptSecondary}
                onPress={() => void handleSkipPushEducation()}
                disabled={isEnablingPush}
                accessibilityRole="button"
              >
                <Text style={styles.pushPromptSecondaryText}>Не сейчас</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  pushPromptOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: SPACING.lg,
    backgroundColor: "rgba(25, 22, 20, 0.56)",
  },
  pushPromptCard: {
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: "#FFF9EA",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  pushPromptIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
    backgroundColor: "rgba(99, 97, 40, 0.12)",
  },
  pushPromptTitle: {
    fontFamily: FONTS.montserratBold,
    color: COLORS.text,
    fontSize: 22,
    lineHeight: 28,
    textAlign: "center",
  },
  pushPromptText: {
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  pushPromptSecondary: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
  },
  pushPromptSecondaryText: {
    fontFamily: FONTS.montserratMedium,
    color: COLORS.primary,
    fontSize: 15,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingTop: 0,
    gap: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  headerImage: {
    aspectRatio: 1842 / 854,
    marginHorizontal: -SPACING.md,
  },
  formCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  listCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: FONTS.impact,
    color: COLORS.text,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    marginTop: 4,
  },
  timezoneHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    marginTop: 4,
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
  },
  timeField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
  },
  timeFieldText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  allDaysToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: "transparent",
  },
  allDaysToggleActive: {
    backgroundColor: COLORS.primary,
  },
  allDaysText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
    color: COLORS.primary,
  },
  allDaysTextActive: {
    color: COLORS.onPrimary,
  },
  daysRow: {
    flexDirection: "row",
    gap: 6,
  },
  dayChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFF",
    alignItems: "center",
  },
  dayChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayChipDisabled: {
    opacity: 0.4,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  dayChipTextSelected: {
    color: COLORS.onPrimary,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    backgroundColor: "#fff",
  },
  itemMeta: { flex: 1 },
  itemName: {
    color: COLORS.text,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
    fontSize: 13,
  },
  itemDetail: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#FDEAEA",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalDismissArea: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: COLORS.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: "#D4C4A8",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: FONTS.impact,
    color: COLORS.text,
  },
  modalDone: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
  },
  pickerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
    position: "relative",
  },
  pickerHighlight: {
    position: "absolute",
    top: "50%",
    left: SPACING.xl,
    right: SPACING.xl,
    height: ITEM_H,
    marginTop: -ITEM_H / 2,
    backgroundColor: "rgba(99,97,40,0.12)",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(99,97,40,0.2)",
  },
  pickerColumn: {
    height: PICKER_HEIGHT,
    width: 72,
  },
  pickerItem: {
    height: ITEM_H,
    justifyContent: "center",
    alignItems: "center",
  },
  pickerItemSelected: {},
  pickerItemText: {
    fontSize: 22,
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
    fontWeight: "400",
  },
  pickerItemTextSelected: {
    fontSize: 26,
    fontWeight: "700",
    color: COLORS.text,
  },
  pickerSeparator: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.text,
    paddingHorizontal: 8,
    fontFamily: FONTS.montserrat,
  },
});
