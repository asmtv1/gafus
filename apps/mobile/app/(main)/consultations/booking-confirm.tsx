import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Button as PaperButton, Text } from "react-native-paper";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { useQueryClient } from "@tanstack/react-query";
import { formatConsultationConfirmSlotMsk } from "@gafus/consultation-shared";
import { isLikelyValidRuPhoneInput } from "@gafus/consultation-shared";
import { randomUUID } from "expo-crypto";
import type { Href } from "expo-router";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import {
  CONSULT_NAME_MAX,
  CONSULT_TEXT_MAX,
  isBookingIntakeValid,
  isOwnerOrPetName,
  isProblemField,
  isSelfHelpField,
  SLOT_TAKEN_MESSAGE,
} from "@/features/consultations";
import { Button, Input } from "@/shared/components/ui";
import { consultationsApi, isSubscriptionRequiredCode } from "@/shared/lib/api";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { trackEvent } from "@/shared/lib/analytics";
import { useAuthStore } from "@/shared/stores/authStore";
import { bookingDurableNative, type BookingTombstoneRead } from "@/features/consultations";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import {
  beginBookingAttempt,
  bookingAttemptCurrent,
  currentBookingAttempt,
  finishBookingAttempt,
  markBookingSending,
  releaseBeforePost,
  releaseRejectedBookingAttempt,
  isDefiniteConsultationPrecommitAccessFailure,
  unresolvedBookingForOwner,
  type BookingAttempt,
} from "@/features/consultations";
import {
  openConsultationAccessPaywall,
  showConsultationBookingNotIncludedAlert,
} from "@/features/consultations";

function one(param: string | string[] | undefined): string {
  return Array.isArray(param) ? (param[0] ?? "") : (param ?? "");
}

/**
 * Анкета записи — паритет с web `ConsultationBookingConfirmClient`.
 */
export default function ConsultationBookingConfirmScreen() {
  const params = useLocalSearchParams<{
    cynologistUserId?: string | string[];
    slotId?: string | string[];
    startAtUtc?: string | string[];
    endAtUtc?: string | string[];
    cynologistName?: string | string[];
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [clientOwnerName, setClientOwnerName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [petName, setPetName] = useState("");
  const [petGender, setPetGender] = useState<"MALE" | "FEMALE" | null>(null);
  const [petAge, setPetAge] = useState("");
  const [petBreed, setPetBreed] = useState("");
  const [clientProblem, setClientProblem] = useState("");
  const [clientSelfHelpAttempt, setClientSelfHelpAttempt] = useState("");
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [bookingRestriction, setBookingRestriction] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const ownerProfile = useAuthStore((state) => state.user);
  const ownerId = ownerProfile?.id ?? null;
  const epoch = newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null;
  const mounted = useRef(false);
  const posting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingAcknowledgement, setSavingAcknowledgement] = useState(false);
  const confirmationBusy = useRef(false);
  const operationSequence = useRef(0);
  const durableReadSequence = useRef(0);
  const [durable, setDurable] = useState<BookingTombstoneRead>({ status: "UNAVAILABLE" });
  const [durableActor, setDurableActor] = useState<string | null>(null);
  const scopedDurable = useCallback(
    (value: BookingTombstoneRead) => {
      setDurable(value);
      setDurableActor(`${ownerId}:${epoch}`);
    },
    [ownerId, epoch],
  );
  const visibleDurable: BookingTombstoneRead =
    durableActor === `${ownerId}:${epoch}` ? durable : { status: "UNAVAILABLE" };
  const [checkingDurable, setCheckingDurable] = useState(true);

  const cynologistUserId = one(params.cynologistUserId);
  const slotId = one(params.slotId);
  const startAtUtc = one(params.startAtUtc);
  const endAtUtc = one(params.endAtUtc);
  const cynologistName = one(params.cynologistName);
  const [activeAttempt, setActiveAttempt] = useState<BookingAttempt | null>(() =>
    ownerId && epoch ? currentBookingAttempt(ownerId, epoch, cynologistUserId, slotId) : null,
  );
  const existingAttempt =
    ownerId && epoch ? currentBookingAttempt(ownerId, epoch, cynologistUserId, slotId) : null;
  const otherSlotUnknown =
    !!ownerId && !!epoch && unresolvedBookingForOwner(ownerId, epoch) && !existingAttempt;
  const pendingOrUnknown =
    !!existingAttempt ||
    isSubmitting ||
    otherSlotUnknown ||
    checkingDurable ||
    (visibleDurable.status !== "CLEAR" &&
      visibleDurable.status !== "CONFIRMED" &&
      visibleDurable.status !== "REJECTED");
  const uncertain =
    existingAttempt?.state === "unknown" ||
    (activeAttempt?.state === "unknown" &&
      activeAttempt.ownerId === ownerId &&
      activeAttempt.authEpoch === epoch);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      posting.current = false;
      operationSequence.current += 1;
      const attempt = currentBookingAttempt(ownerId ?? "", epoch ?? "", cynologistUserId, slotId);
      if (attempt?.postStarted && attempt.state === "sending")
        finishBookingAttempt(attempt, "unknown");
      if (attempt && !attempt.postStarted) releaseBeforePost(attempt);
    };
  }, [ownerId, epoch, cynologistUserId, slotId]);
  useEffect(() => {
    setActiveAttempt(existingAttempt);
  }, [ownerId, epoch, cynologistUserId, slotId]);
  const refreshDurable = useCallback(async () => {
    const readSequence = ++durableReadSequence.current;
    setCheckingDurable(true);
    if (!ownerId || !epoch || !ownerProfile) {
      if (mounted.current) {
        scopedDurable({ status: "UNAVAILABLE" });
        setCheckingDurable(false);
      }
      return;
    }
    const checked = await bookingDurableNative.read(ownerId, epoch);
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    if (
      mounted.current &&
      readSequence === durableReadSequence.current &&
      useAuthStore.getState().user === ownerProfile &&
      binding?.principalId === ownerId &&
      binding.authEpoch === epoch
    ) {
      scopedDurable(checked);
      setCheckingDurable(false);
    }
  }, [ownerId, epoch, ownerProfile, scopedDurable]);
  useEffect(() => {
    void refreshDurable();
  }, [refreshDurable]);

  const slotLabel = useMemo(
    () => formatConsultationConfirmSlotMsk(startAtUtc, endAtUtc),
    [startAtUtc, endAtUtc],
  );

  const canSubmit = useMemo(
    () =>
      isBookingIntakeValid({
        clientOwnerName,
        clientPhone,
        petName,
        petGender,
        petAge,
        petBreed,
        clientProblem,
        clientSelfHelpAttempt,
        phoneOk: isLikelyValidRuPhoneInput,
      }),
    [
      clientOwnerName,
      clientPhone,
      petName,
      petGender,
      petAge,
      petBreed,
      clientProblem,
      clientSelfHelpAttempt,
    ],
  );

  useEffect(() => {
    if (canSubmit) {
      setShowFieldErrors(false);
    }
  }, [canSubmit]);

  useEffect(() => {
    let cancelled = false;
    const expectedProfile = ownerProfile;
    const expectedEpoch = epoch;
    const sameSession = () => {
      const binding = newOnlyV2NativeQueues.getVerifiedBinding();
      return (
        !!expectedProfile &&
        useAuthStore.getState().user === expectedProfile &&
        binding?.principalId === ownerId &&
        binding.authEpoch === expectedEpoch
      );
    };
    if (cynologistUserId && slotId) {
      void consultationsApi
        .verifySlotFree(cynologistUserId, slotId)
        .then((res) => {
          if (
            !cancelled &&
            sameSession() &&
            (res.code === "CONSULTATION_ACTIVE_BOOKING" ||
              res.code === "CONSULTATION_WEEKLY_COOLDOWN")
          ) {
            setBookingRestriction(res.error ?? "Запись временно недоступна");
          }
        })
        .catch(() => {
          /* Submit verifies again and displays request errors. */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [cynologistUserId, slotId, ownerId, epoch, ownerProfile]);

  const isCurrentActor = useCallback(
    (capturedOwner: string, capturedEpoch: string, capturedProfile: typeof ownerProfile) => {
      const binding = newOnlyV2NativeQueues.getVerifiedBinding();
      return (
        mounted.current &&
        !!capturedProfile &&
        useAuthStore.getState().user === capturedProfile &&
        binding?.principalId === capturedOwner &&
        binding.authEpoch === capturedEpoch
      );
    },
    [],
  );

  /** Manual LOCAL receipt recovery; never another booking HTTP request. */
  const saveServerAcknowledgement = useCallback(async () => {
    if (confirmationBusy.current || !ownerId || !epoch || !ownerProfile) return;
    const attempt = currentBookingAttempt(ownerId, epoch, cynologistUserId, slotId);
    if (!attempt || attempt.state !== "confirmed") return;
    if (!isCurrentActor(ownerId, epoch, ownerProfile)) return;
    confirmationBusy.current = true;
    setSavingAcknowledgement(true);
    try {
      const stored = await bookingDurableNative.confirmAcknowledged(
        ownerId,
        epoch,
        attempt.body.idempotencyKey,
      );
      if (!isCurrentActor(ownerId, epoch, ownerProfile) || !bookingAttemptCurrent(attempt)) return;
      const checked = await bookingDurableNative.read(ownerId, epoch);
      if (!isCurrentActor(ownerId, epoch, ownerProfile)) return;
      if (
        stored &&
        checked.status === "CONFIRMED" &&
        checked.record.idempotencyKey === attempt.body.idempotencyKey
      ) {
        scopedDurable(checked);
        setServerError(null);
      } else {
        setServerError(
          "Сервер подтвердил запись, но локально результат ещё не закреплён. Повторите только сохранение статуса или проверьте «Мои консультации».",
        );
      }
    } finally {
      confirmationBusy.current = false;
      if (isCurrentActor(ownerId, epoch, ownerProfile)) setSavingAcknowledgement(false);
    }
  }, [ownerId, epoch, ownerProfile, cynologistUserId, slotId, isCurrentActor, scopedDurable]);

  const onSubmit = useCallback(() => {
    if (
      posting.current ||
      checkingDurable ||
      (visibleDurable.status !== "CLEAR" &&
        visibleDurable.status !== "CONFIRMED" &&
        visibleDurable.status !== "REJECTED")
    )
      return;
    if (!slotId || !cynologistUserId) {
      Alert.alert("Ошибка", "Не хватает данных для записи.");
      return;
    }
    if (!canSubmit || !petGender) {
      setShowFieldErrors(true);
      setServerError(null);
      return;
    }
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    if (
      !ownerId ||
      !epoch ||
      !ownerProfile ||
      binding?.principalId !== ownerId ||
      binding.authEpoch !== epoch
    ) {
      setServerError("Сессия изменилась. Войдите снова и проверьте свои консультации.");
      return;
    }
    const already = currentBookingAttempt(ownerId, epoch, cynologistUserId, slotId);
    if (already) {
      setActiveAttempt(already);
      return;
    }
    const attempt = beginBookingAttempt(ownerId, epoch, cynologistUserId, {
      slotId,
      idempotencyKey: randomUUID(),
      clientOwnerName: clientOwnerName.trim(),
      clientPhone: clientPhone.trim(),
      petName: petName.trim(),
      petGender,
      petAge: petAge.trim(),
      petBreed: petBreed.trim(),
      clientProblem: clientProblem.trim(),
      clientSelfHelpAttempt: clientSelfHelpAttempt.trim(),
    });
    if (!attempt) return;
    posting.current = true;
    const sequence = ++operationSequence.current;
    setActiveAttempt(attempt);
    setIsSubmitting(true);
    setServerError(null);
    const sameActor = () =>
      isCurrentActor(ownerId, epoch, ownerProfile) && bookingAttemptCurrent(attempt);
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/consultations/booking-confirm",
      elementId: "consultation-booking-submit",
    });
    trackEvent({
      eventName: "booking_start",
      platform: "mobile",
      pathOrScreen: "/consultations/booking-confirm",
    });
    hapticFeedback.light();
    void (async () => {
      try {
        const verified = await consultationsApi.verifySlotFree(cynologistUserId, slotId);
        if (!sameActor()) {
          releaseBeforePost(attempt);
          return;
        }
        if (!verified.success) {
          const code = verified.code ?? "VERIFY_FAILED";
          releaseBeforePost(attempt);
          setActiveAttempt(null);
          if (code === "CONSULTATION_ACTIVE_BOOKING" || code === "CONSULTATION_WEEKLY_COOLDOWN") {
            setBookingRestriction(verified.error ?? "Запись временно недоступна");
            return;
          }
          if (isSubscriptionRequiredCode(code)) {
            openConsultationAccessPaywall();
            return;
          }
          if (code === "CONSULTATION_BOOKING_NOT_INCLUDED") {
            showConsultationBookingNotIncludedAlert();
            return;
          }
          if (code === "CONSULTATION_SLOT_TAKEN" || code === "CONSULTATION_NOT_FOUND") {
            Alert.alert("Слот занят", SLOT_TAKEN_MESSAGE);
            return;
          }
          setServerError(verified.error ?? "Не удалось проверить слот.");
          return;
        }
        // A crash after this write but before the POST conservatively leaves UNKNOWN.
        // Without a durable exact readback we MUST NOT transmit a booking request.
        const prepared = await bookingDurableNative.prepareBeforePost(
          ownerId,
          epoch,
          attempt.body.idempotencyKey,
        );
        if (!sameActor()) {
          releaseBeforePost(attempt);
          return;
        }
        if (prepared !== "READY") {
          const checked = await bookingDurableNative.read(ownerId, epoch);
          if (!sameActor()) {
            releaseBeforePost(attempt);
            return;
          }
          releaseBeforePost(attempt);
          setActiveAttempt(null);
          // A failed persist/readback is never proof that a POST was not sent.
          scopedDurable(
            prepared === "UNAVAILABLE" && checked.status === "CLEAR"
              ? { status: "UNAVAILABLE" }
              : checked,
          );
          if (prepared === "UNAVAILABLE" || checked.status === "UNAVAILABLE")
            setServerError(
              "Не удалось проверить локальное состояние записи. Новая отправка заблокирована.",
            );
          return;
        }
        const checked = await bookingDurableNative.read(ownerId, epoch);
        if (!sameActor()) {
          releaseBeforePost(attempt);
          return;
        }
        if (
          checked.status !== "UNKNOWN" ||
          checked.record.idempotencyKey !== attempt.body.idempotencyKey
        ) {
          releaseBeforePost(attempt);
          setActiveAttempt(null);
          scopedDurable(checked.status === "CLEAR" ? { status: "UNAVAILABLE" } : checked);
          return;
        }
        scopedDurable(checked);
        if (!markBookingSending(attempt)) return;
        setActiveAttempt({ ...attempt });
        // Frozen JSON body and requestGuard keep the original idempotencyKey on 401 refresh.
        const result = await consultationsApi.book(attempt.body, sameActor);
        if (!sameActor()) {
          finishBookingAttempt(attempt, "unknown");
          return;
        }
        if (!result.success && isDefiniteConsultationPrecommitAccessFailure(result)) {
          // Core enforces subscription BEFORE booking mutation. Only a durable
          // exact-key REJECTED permits a manually new booking operation.
          const rejected = await bookingDurableNative.rejectBeforeCommit(
            ownerId,
            epoch,
            attempt.body.idempotencyKey,
          );
          if (!sameActor()) return;
          const verifiedRejected = await bookingDurableNative.read(ownerId, epoch);
          if (!sameActor()) return;
          if (
            (rejected || verifiedRejected.status === "REJECTED") &&
            verifiedRejected.status === "REJECTED" &&
            verifiedRejected.record.idempotencyKey === attempt.body.idempotencyKey
          ) {
            scopedDurable(verifiedRejected);
            finishBookingAttempt(attempt, "rejected");
            releaseRejectedBookingAttempt(attempt);
            setActiveAttempt(null);
            if (result.code === "SUBSCRIPTION_REQUIRED") openConsultationAccessPaywall();
            else if (result.code === "CONSULTATION_BOOKING_NOT_INCLUDED")
              showConsultationBookingNotIncludedAlert();
            setServerError(
              "Сервер отказал в доступе до создания брони. После устранения причины можно вручную начать новую операцию.",
            );
            return;
          }
          scopedDurable(
            verifiedRejected.status === "CLEAR" ? { status: "UNAVAILABLE" } : verifiedRejected,
          );
        }
        if (!result.success || !result.data) {
          finishBookingAttempt(attempt, "unknown");
          setActiveAttempt({ ...attempt });
          reportClientError(new Error(result.error ?? result.code ?? "BOOKING_RESULT_UNKNOWN"), {
            issueKey: "consultation",
            keys: { screen: "booking-confirm", code: result.code ?? "UNKNOWN" },
          });
          return;
        }
        // Acknowledged by server: best-effort durable confirmation. On storage
        // failure the prior UNKNOWN is deliberately retained for manual review.
        const confirmedLocally = await bookingDurableNative.confirmAcknowledged(
          ownerId,
          epoch,
          attempt.body.idempotencyKey,
        );
        if (!sameActor()) return;
        const ackRead = await bookingDurableNative.read(ownerId, epoch);
        if (!sameActor()) return;
        finishBookingAttempt(attempt, "confirmed");
        setActiveAttempt({ ...attempt });
        if (
          !confirmedLocally ||
          ackRead.status !== "CONFIRMED" ||
          ackRead.record.idempotencyKey !== attempt.body.idempotencyKey
        ) {
          setServerError(
            "Сервер подтвердил запись, но локально статус не сохранился. Нажмите «Сохранить подтверждение» или проверьте «Мои консультации».",
          );
          return;
        }
        scopedDurable(ackRead);
        setServerError(null);
        trackEvent({
          eventName: "booking_confirm",
          platform: "mobile",
          pathOrScreen: "/consultations/booking-confirm",
        });
        void queryClient.invalidateQueries({ queryKey: ["consultations"] }).catch(() => {});
        hapticFeedback.medium();
        router.replace("/(main)/(tabs)/consultations?view=mine" as Href);
      } catch (error) {
        if (!bookingAttemptCurrent(attempt)) return;
        if (attempt.postStarted) {
          finishBookingAttempt(attempt, "unknown");
          if (sameActor()) setActiveAttempt({ ...attempt });
        } else {
          const stillHere = isCurrentActor(ownerId, epoch, ownerProfile);
          releaseBeforePost(attempt);
          if (stillHere) {
            setActiveAttempt(null);
            setServerError("Не удалось проверить слот. Попробуйте позже.");
          }
        }
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "consultation",
          keys: {
            screen: "booking-confirm",
            stage: attempt.postStarted ? "post_unknown" : "verify",
          },
        });
      } finally {
        // Old callbacks must not clear a fresh actor's in-flight button state.
        if (
          operationSequence.current === sequence &&
          isCurrentActor(ownerId, epoch, ownerProfile)
        ) {
          posting.current = false;
          setIsSubmitting(false);
        }
      }
    })();
  }, [
    slotId,
    cynologistUserId,
    canSubmit,
    petGender,
    ownerId,
    epoch,
    ownerProfile,
    clientOwnerName,
    clientPhone,
    petName,
    petAge,
    petBreed,
    clientProblem,
    clientSelfHelpAttempt,
    isCurrentActor,
    queryClient,
    router,
    checkingDurable,
    visibleDurable.status,
    scopedDurable,
  ]);

  if (bookingRestriction) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: SPACING.md, gap: SPACING.md }}>
          <Text accessibilityRole="alert" style={styles.lead}>
            {bookingRestriction}
          </Text>
          <Button
            label="Мои консультации"
            onPress={() => router.replace("/consultations/mine" as Href)}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!cynologistUserId || !slotId) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <Text style={styles.error}>Не указаны параметры записи.</Text>
      </SafeAreaView>
    );
  }

  const phoneInvalid =
    (showFieldErrors && !isLikelyValidRuPhoneInput(clientPhone)) ||
    (clientPhone.length > 0 && !isLikelyValidRuPhoneInput(clientPhone));

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerBackVisible: false }} />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <AppBackButton style={styles.backRow} onPress={() => router.back()} />
          <Text style={styles.screenTitle}>Подтверждение записи</Text>
          <Text style={styles.lead}>
            Заполните данные владельца и питомца — кинолог увидит их в заявке.
          </Text>

          <View style={styles.metaBlock}>
            <Text style={styles.metaRow}>
              <Text style={styles.metaLabel}>Кинолог: </Text>
              {cynologistName.trim() ? cynologistName : "Кинолог"}
            </Text>
            <Text style={styles.metaRow}>
              <Text style={styles.metaLabel}>Слот: </Text>
              {slotLabel}
            </Text>
            <Text style={styles.metaHint}>Все времена рассчитываются по МСК (UTC+3).</Text>
          </View>

          {visibleDurable.status === "UNAVAILABLE" && !checkingDurable ? (
            <View style={styles.serverErrorBanner}>
              <Text accessibilityRole="alert" style={styles.serverErrorText}>
                Не удалось проверить локальное состояние бронирования. Новая запись заблокирована,
                пока не удастся прочитать сохранённые данные. Пустой список не доказывает отсутствие
                брони.
              </Text>
              <Button label="Проверить локальную запись" onPress={() => void refreshDurable()} />
            </View>
          ) : null}
          {(visibleDurable.status === "UNKNOWN" || visibleDurable.status === "EXPIRED") &&
          !uncertain &&
          existingAttempt?.state !== "confirmed" &&
          !isSubmitting ? (
            <View style={styles.serverErrorBanner}>
              <Text accessibilityRole="alert" style={styles.serverErrorText}>
                Обнаружена сохранённая неподтверждённая попытка записи. Сервер мог создать бронь.
                Новая отправка заблокирована до ручной проверки.
                {visibleDurable.status === "EXPIRED"
                  ? " Прошло более 24 часов: срок серверной квитанции мог истечь, но это не доказывает отсутствие брони."
                  : " Пустой список консультаций не доказывает отсутствие брони."}
              </Text>
              <Button
                label="Проверить мои консультации"
                onPress={() => router.push("/consultations/mine" as Href)}
              />
            </View>
          ) : null}
          {visibleDurable.status === "REJECTED" ? (
            <View style={styles.serverErrorBanner}>
              <Text accessibilityRole="alert" style={styles.serverErrorText}>
                Предыдущий запрос отклонён до создания брони. После устранения ограничения можно
                вручную начать новую операцию. Автоматического повтора нет.
              </Text>
            </View>
          ) : null}
          {existingAttempt?.state === "confirmed" && visibleDurable.status !== "CONFIRMED" ? (
            <View style={styles.serverErrorBanner}>
              <Text accessibilityRole="alert" style={styles.serverErrorText}>
                Сервер подтвердил бронирование, но локальная отметка не подтверждена. Повторять
                отправку бронирования не нужно.
              </Text>
              <Button
                label="Сохранить подтверждение"
                onPress={() => void saveServerAcknowledgement()}
                disabled={savingAcknowledgement}
              />
              <Button
                label="Мои консультации"
                onPress={() => router.push("/consultations/mine" as Href)}
              />
            </View>
          ) : null}
          {existingAttempt?.state === "confirmed" && visibleDurable.status === "CONFIRMED" ? (
            <View style={styles.serverErrorBanner}>
              <Text accessibilityRole="alert" style={styles.serverErrorText}>
                Сервер подтвердил запись. Посмотрите её в «Моих консультациях».
              </Text>
              <Button
                label="Мои консультации"
                onPress={() => router.push("/consultations/mine" as Href)}
              />
            </View>
          ) : null}
          {otherSlotUnknown ? (
            <View style={styles.serverErrorBanner}>
              <Text accessibilityRole="alert" style={styles.serverErrorText}>
                Предыдущая запись ещё не подтверждена. Даже пустой список консультаций не доказывает
                отсутствие брони. Проверьте статус в поддержке до новой записи.
              </Text>
              <Button
                label="Проверить мои консультации"
                onPress={() => router.push("/consultations/mine" as Href)}
              />
            </View>
          ) : null}
          {uncertain ? (
            <View style={styles.serverErrorBanner}>
              <Text accessibilityRole="alert" style={styles.serverErrorText}>
                Результат отправки записи не подтверждён. Сервер мог создать бронь. Проверьте «Мои
                консультации» или обратитесь в поддержку перед повторной записью. Отсутствие записи
                в списке не доказывает, что бронирование не состоялось.
              </Text>
              <Button
                label="Проверить мои консультации"
                onPress={() => router.push("/consultations/mine" as Href)}
              />
            </View>
          ) : null}
          {serverError ? (
            <View style={styles.serverErrorBanner}>
              <Text style={styles.serverErrorText}>{serverError}</Text>
              <Pressable
                onPress={() => setServerError(null)}
                hitSlop={8}
                accessibilityLabel="Скрыть ошибку"
              >
                <Text style={styles.serverErrorClose}>×</Text>
              </Pressable>
            </View>
          ) : null}

          {showFieldErrors && !canSubmit ? (
            <View style={styles.validationBanner}>
              <Text style={styles.validationBannerText}>
                Заполните все обязательные поля — пустые поля подсвечены красным.
              </Text>
            </View>
          ) : null}

          <Input
            label="Имя владельца *"
            value={clientOwnerName}
            onChangeText={(t) => setClientOwnerName(t.slice(0, CONSULT_NAME_MAX))}
            maxLength={CONSULT_NAME_MAX}
            style={styles.field}
            error={showFieldErrors && !isOwnerOrPetName(clientOwnerName) ? " " : undefined}
          />
          {showFieldErrors && !isOwnerOrPetName(clientOwnerName) ? (
            <Text style={styles.fieldError}>От 2 до 15 символов</Text>
          ) : null}
          <Input
            label="Номер телефона для связи *"
            value={clientPhone}
            onChangeText={setClientPhone}
            placeholder="+7 … или +998 … (с кодом страны)"
            keyboardType="phone-pad"
            style={styles.field}
            error={phoneInvalid ? " " : undefined}
          />
          {phoneInvalid ? (
            <Text style={styles.fieldError}>
              Укажите номер с кодом страны, например +7 или +998
            </Text>
          ) : null}
          <Input
            label="Имя питомца *"
            value={petName}
            onChangeText={(t) => setPetName(t.slice(0, CONSULT_NAME_MAX))}
            maxLength={CONSULT_NAME_MAX}
            style={styles.field}
            error={showFieldErrors && !isOwnerOrPetName(petName) ? " " : undefined}
          />
          {showFieldErrors && !isOwnerOrPetName(petName) ? (
            <Text style={styles.fieldError}>От 2 до 15 символов</Text>
          ) : null}
          <Text style={styles.genderLabel}>Пол питомца *</Text>
          <View
            style={[
              styles.genderRow,
              showFieldErrors && petGender == null ? styles.genderRowError : null,
            ]}
          >
            <Button
              label="Мальчик"
              variant={petGender === "MALE" ? "selected" : "primary"}
              flex={1}
              fullWidth={false}
              height={52}
              fontSize={15}
              lineHeight={20}
              fontFamily={FONTS.montserratMedium}
              horizontalPadding={6}
              verticalPadding={0}
              borderRadius={12}
              animatedPress
              haptic={false}
              onPress={() => {
                void hapticFeedback.selection();
                setPetGender("MALE");
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: petGender === "MALE" }}
            />
            <Button
              label="Девочка"
              variant={petGender === "FEMALE" ? "selected" : "primary"}
              flex={1}
              fullWidth={false}
              height={52}
              fontSize={15}
              lineHeight={20}
              fontFamily={FONTS.montserratMedium}
              horizontalPadding={6}
              verticalPadding={0}
              borderRadius={12}
              animatedPress
              haptic={false}
              onPress={() => {
                void hapticFeedback.selection();
                setPetGender("FEMALE");
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: petGender === "FEMALE" }}
            />
          </View>
          {showFieldErrors && petGender == null ? (
            <Text style={styles.fieldError}>Выберите пол питомца</Text>
          ) : null}
          <Input
            label="Возраст питомца *"
            value={petAge}
            onChangeText={setPetAge}
            placeholder="например, 2 года"
            style={styles.field}
            error={showFieldErrors && !petAge.trim() ? " " : undefined}
          />
          {showFieldErrors && !petAge.trim() ? (
            <Text style={styles.fieldError}>Укажите возраст</Text>
          ) : null}
          <Input
            label="Порода *"
            value={petBreed}
            onChangeText={setPetBreed}
            style={styles.field}
            error={showFieldErrors && !petBreed.trim() ? " " : undefined}
          />
          {showFieldErrors && !petBreed.trim() ? (
            <Text style={styles.fieldError}>Укажите породу</Text>
          ) : null}
          <Input
            label="Проблема *"
            multiline
            numberOfLines={4}
            value={clientProblem}
            onChangeText={(t) => setClientProblem(t.slice(0, CONSULT_TEXT_MAX))}
            maxLength={CONSULT_TEXT_MAX}
            style={styles.textArea}
            error={showFieldErrors && !isProblemField(clientProblem) ? " " : undefined}
          />
          {showFieldErrors && !isProblemField(clientProblem) ? (
            <Text style={styles.fieldError}>От 10 до 1000 символов</Text>
          ) : null}
          <Input
            label="Как пытались решить сами *"
            multiline
            numberOfLines={4}
            value={clientSelfHelpAttempt}
            onChangeText={(t) => setClientSelfHelpAttempt(t.slice(0, CONSULT_TEXT_MAX))}
            maxLength={CONSULT_TEXT_MAX}
            style={styles.textArea}
            error={showFieldErrors && !isSelfHelpField(clientSelfHelpAttempt) ? " " : undefined}
          />
          {showFieldErrors && !isSelfHelpField(clientSelfHelpAttempt) ? (
            <Text style={styles.fieldError}>Заполните поле, не более 1000 символов</Text>
          ) : null}

          <Text style={styles.notice}>
            Если вы отправляли запись и не получили подтверждения, сначала проверьте её вручную.
            Даже пустой список консультаций не гарантирует, что бронь отсутствует.
          </Text>
          <Text style={styles.notice}>
            После нажатия «Забронировать» вам на почту придёт ссылка на Телемост. В назначенное
            время подключитесь по этой ссылке — кинолог будет ждать вас там.
          </Text>
          <Text style={styles.notice}>
            Если письмо со ссылкой не пришло, проверьте папку «Спам» или напишите в поддержку.
          </Text>

          <View style={styles.actions}>
            <AppBackButton
              label="Назад к слотам"
              onPress={() => router.replace(`/consultations/${cynologistUserId}` as Href)}
              disabled={isSubmitting}
            />
            <PaperButton
              mode="contained"
              onPress={onSubmit}
              loading={isSubmitting}
              disabled={pendingOrUnknown}
              style={[
                styles.actionButton,
                !canSubmit && !isSubmitting ? styles.bookBtnInactive : null,
              ]}
              contentStyle={styles.actionButtonContent}
              labelStyle={styles.actionButtonLabel}
              buttonColor={COLORS.primary}
              accessibilityLabel={
                !canSubmit
                  ? "Забронировать: сначала заполните все обязательные поля"
                  : "Забронировать консультацию"
              }
            >
              Забронировать
            </PaperButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  keyboardView: { flex: 1 },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xl, gap: SPACING.sm },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: SPACING.xs,
  },
  backRowText: {
    marginLeft: 2,
    color: COLORS.primary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 18,
  },
  screenTitle: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 20,
    color: COLORS.text,
  },
  lead: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.textSecondary },
  metaBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    gap: SPACING.xs,
  },
  metaRow: { fontFamily: FONTS.montserrat, fontSize: 14, color: COLORS.text },
  metaLabel: { fontFamily: FONTS.montserratMedium, color: COLORS.text },
  metaHint: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  serverErrorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    backgroundColor: "rgba(211, 47, 47, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(211, 47, 47, 0.35)",
    borderRadius: 8,
    padding: SPACING.sm,
  },
  serverErrorText: {
    flex: 1,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    color: COLORS.error,
    lineHeight: 20,
  },
  serverErrorClose: {
    fontSize: 22,
    lineHeight: 24,
    color: COLORS.error,
    paddingHorizontal: 4,
  },
  field: { backgroundColor: COLORS.cardBackground },
  fieldError: {
    color: COLORS.error,
    fontSize: 12,
    fontFamily: FONTS.montserrat,
    marginTop: -4,
  },
  genderLabel: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 14,
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  genderRow: { flexDirection: "row", gap: SPACING.sm },
  textArea: { backgroundColor: COLORS.cardBackground, minHeight: 100 },
  notice: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  actions: { flexDirection: "column", gap: SPACING.sm, marginTop: SPACING.md },
  actionButton: {
    borderRadius: 14,
  },
  actionButtonContent: {
    minHeight: 48,
    paddingVertical: 2,
  },
  actionButtonLabel: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 18,
    lineHeight: 22,
  },
  bookBtnInactive: { opacity: 0.6 },
  validationBanner: {
    backgroundColor: "rgba(180, 140, 40, 0.15)",
    borderRadius: 10,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: "rgba(180, 140, 40, 0.45)",
  },
  validationBannerText: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  genderRowError: {
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 10,
    padding: SPACING.xs,
  },
  error: { color: COLORS.error, padding: SPACING.md, fontFamily: FONTS.montserrat },
});
