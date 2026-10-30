import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useFocusEffect, useRouter } from "expo-router";
import type { ConsultationBookingDto } from "@gafus/consultation-shared";
import { consultationsApi } from "@/shared/lib/api/consultations";
import { reportClientError } from "@/shared/lib/tracer";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";

type Transition = "confirm" | "reject" | "complete" | "no-show";
const expected: Record<Transition, ConsultationBookingDto["status"]> = {
  confirm: "CONFIRMED",
  reject: "CANCELLED_BY_TRAINER",
  complete: "COMPLETED",
  "no-show": "NO_SHOW",
};
const actions: Record<Transition, string> = {
  confirm: "Подтвердить",
  reject: "Отклонить / отменить",
  complete: "Завершить",
  "no-show": "Клиент не пришёл",
};

export default function TrainerConsultationsScreen() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const userId = user?.id ?? null;
  const role = user?.role ?? null;
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = binding?.principalId === userId ? binding.authEpoch : null;
  const canAccess = role === "TRAINER" && !!userId && !!epoch;
  const [bookings, setBookings] = useState<ConsultationBookingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const flight = useRef(false);
  const readSerial = useRef(0);

  const isCurrent = useCallback(() => {
    const current = useAuthStore.getState().user;
    const bound = newOnlyV2NativeQueues.getVerifiedBinding();
    return mounted.current && !!userId && !!epoch && role === "TRAINER" &&
      current?.id === userId && current?.role === role &&
      bound?.principalId === userId && bound.authEpoch === epoch;
  }, [userId, role, epoch]);

  const refresh = useCallback(async () => {
    const serial = ++readSerial.current;
    if (!isCurrent()) return;
    setLoading(true);
    try {
      const response = await consultationsApi.trainerBookings();
      if (!isCurrent() || serial !== readSerial.current) return;
      if (!response.success || !Array.isArray(response.data) ||
          response.data.length > 200 || response.data.some(item =>
            !item.id || item.cynologistUserId !== userId || !item.slot?.startAtUtc)) {
        throw Error("Не удалось проверить список ваших консультаций.");
      }
      setBookings(response.data);
      setError("");
    } catch (cause) {
      reportClientError(cause instanceof Error ? cause : new Error(String(cause)), {
        issueKey: "TrainerConsultations",
        keys: { operation: "refresh_bookings" },
      });
      if (isCurrent() && serial === readSerial.current)
        setError("Не удалось обновить консультации. Повторите загрузку.");
    } finally {
      if (isCurrent() && serial === readSerial.current) setLoading(false);
    }
  }, [isCurrent, userId]);

  useEffect(() => {
    mounted.current = true;
    setBookings([]);
    return () => { mounted.current = false; };
  }, [userId, epoch]);
  useFocusEffect(useCallback(() => {
    mounted.current = true;
    void refresh();
    return () => { readSerial.current++; };
  }, [refresh]));

  const mutate = (booking: ConsultationBookingDto, mode: Transition) => {
    if (flight.current || !isCurrent() || booking.cynologistUserId !== userId)
      return;
    Alert.alert("Изменить статус консультации?", actions[mode], [
      { text: "Отмена", style: "cancel" },
      {
        text: actions[mode], style: mode === "reject" ? "destructive" : "default",
        onPress: () => {
          if (flight.current || !isCurrent()) return;
          flight.current = true;
          setBusy(booking.id);
          void (async () => {
            try {
              const result = await consultationsApi.trainerTransition(booking.id, mode, isCurrent);
              if (!isCurrent()) return;
              if (!result.success || result.data?.bookingId !== booking.id)
                throw Error("Не удалось подтвердить изменение статуса.");
              const fresh = await consultationsApi.trainerBookings();
              if (!isCurrent()) return;
              if (!fresh.success || !Array.isArray(fresh.data) ||
                  fresh.data.length > 200 ||
                  fresh.data.some(item => item.cynologistUserId !== userId) ||
                  !fresh.data.some(item => item.id === booking.id &&
                    item.status === expected[mode] &&
                    (mode !== "reject" || item.slot.status === "FREE")))
                throw Error("Не удалось подтвердить изменение статуса.");
              setBookings(fresh.data);
              setError("");
            } catch (cause) {
              reportClientError(cause instanceof Error ? cause : new Error(String(cause)), {
                issueKey: "TrainerConsultations",
                keys: { operation: "transition_booking" },
              });
              if (isCurrent()) setError(
                "Результат изменения неизвестен. Обновите список; повторный запрос автоматически не отправляется.",
              );
            } finally {
              flight.current = false;
              if (isCurrent()) setBusy(null);
            }
          })();
        },
      },
    ]);
  };

  if (!canAccess) return <View style={styles.page}>
    <Text variant="titleMedium">Консультации кинолога</Text>
    <Text>Доступ есть только у авторизованного кинолога.</Text>
  </View>;

  return <ScrollView contentContainerStyle={styles.page}>
    <Pressable onPress={() => router.back()} accessibilityRole="button">
      <Text>← Назад</Text>
    </Pressable>
    <Text variant="headlineSmall">Консультации кинолога</Text>
    <Text>Заявки, подтверждения и результаты встреч</Text>
    <Pressable onPress={() => void refresh()} disabled={!!busy} style={styles.button}
      accessibilityRole="button"><Text style={styles.buttonText}>Обновить список</Text></Pressable>
    {loading && <ActivityIndicator />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!loading && !bookings.length && <Text>Заявок пока нет.</Text>}
    {bookings.map(booking => <View key={booking.id} style={styles.card}>
      <Text variant="titleMedium">{booking.clientOwnerName || booking.clientUsername || "Клиент"}</Text>
      <Text>Статус: {booking.status}</Text>
      <Text>Начало (UTC): {booking.slot.startAtUtc}</Text>
      {booking.petName && <Text>Питомец: {booking.petName}</Text>}
      {booking.clientProblem && <Text>Вопрос: {booking.clientProblem}</Text>}
      {booking.status === "PENDING_TRAINER_CONFIRMATION" && (
        <View style={styles.actions}>
          {(["confirm", "reject"] as const).map(mode =>
            <Pressable key={mode} disabled={!!busy} style={styles.button}
              accessibilityRole="button" onPress={() => mutate(booking, mode)}>
              <Text style={styles.buttonText}>{actions[mode]}</Text>
            </Pressable>)}
        </View>
      )}
      {booking.status === "CONFIRMED" && (
        <View style={styles.actions}>
          {(["complete", "no-show", "reject"] as const).map(mode =>
            <Pressable key={mode} disabled={!!busy} style={styles.button}
              accessibilityRole="button" onPress={() => mutate(booking, mode)}>
              <Text style={styles.buttonText}>{actions[mode]}</Text>
            </Pressable>)}
          <Text>Видеозвонок доступен в веб-панели тренера в разрешённое время.</Text>
        </View>
      )}
      {busy === booking.id && <ActivityIndicator />}
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { padding: 18, gap: 14, flexGrow: 1, backgroundColor: "#f8f9f5" },
  card: { backgroundColor: "#fff", padding: 16, borderRadius: 14, gap: 8 },
  actions: { gap: 8 },
  button: { backgroundColor: "#647651", borderRadius: 9, padding: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#b3261e" },
});
