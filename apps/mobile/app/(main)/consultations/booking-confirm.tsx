import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  /** Сервер: `z.string().uuid()` — только v4, без слабого fallback. */
  const [idemKey] = useState(() => randomUUID());

  const cynologistUserId = one(params.cynologistUserId);
  const slotId = one(params.slotId);
  const startAtUtc = one(params.startAtUtc);
  const endAtUtc = one(params.endAtUtc);
  const cynologistName = one(params.cynologistName);

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
    if (cynologistUserId && slotId) {
      void consultationsApi.verifySlotFree(cynologistUserId, slotId).then((res) => {
        if (!cancelled && (res.code === "CONSULTATION_ACTIVE_BOOKING" || res.code === "CONSULTATION_WEEKLY_COOLDOWN")) {
          setBookingRestriction(res.error ?? "Запись временно недоступна");
        }
      }).catch(() => { /* Submit verifies again and displays request errors. */ });
    }
    return () => { cancelled = true; };
  }, [cynologistUserId, slotId]);

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (petGender == null) {
        throw new Error("petGender");
      }
      const verified = await consultationsApi.verifySlotFree(cynologistUserId, slotId);
      if (!verified.success) {
        const code = verified.code ?? "VERIFY_FAILED";
        throw Object.assign(new Error(verified.error ?? code), { code });
      }
      const res = await consultationsApi.book({
        slotId,
        idempotencyKey: idemKey,
        clientOwnerName: clientOwnerName.trim(),
        clientPhone: clientPhone.trim(),
        petName: petName.trim(),
        petGender,
        petAge: petAge.trim(),
        petBreed: petBreed.trim(),
        clientProblem: clientProblem.trim(),
        clientSelfHelpAttempt: clientSelfHelpAttempt.trim(),
      });
      if (!res.success) {
        const code = res.code ?? "BOOK_FAILED";
        throw Object.assign(new Error(res.error ?? code), { code });
      }
      return res.data;
    },
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async () => {
      setServerError(null);
      trackEvent({
        eventName: "booking_confirm",
        platform: "mobile",
        pathOrScreen: "/consultations/booking-confirm",
      });
      await queryClient.invalidateQueries({ queryKey: ["consultations"] });
      hapticFeedback.medium();
      router.replace("/(main)/(tabs)/consultations?view=mine" as Href);
    },
    onError: (e: unknown) => {
      const code =
        typeof e === "object" && e && "code" in e ? String((e as { code?: string }).code) : "";
      const msg = e instanceof Error ? e.message : String(e);
      if (code === "CONSULTATION_ACTIVE_BOOKING" || code === "CONSULTATION_WEEKLY_COOLDOWN") {
        setBookingRestriction(msg);
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
      if (
        code === "CONSULTATION_SLOT_TAKEN" ||
        code === "CONSULTATION_NOT_FOUND" ||
        msg.includes("CONSULTATION_SLOT_TAKEN") ||
        msg.toLowerCase().includes("занят")
      ) {
        Alert.alert("Слот занят", SLOT_TAKEN_MESSAGE, [
          {
            text: "OK",
            onPress: () => router.replace(`/consultations/${cynologistUserId}` as Href),
          },
        ]);
        return;
      }
      reportClientError(e instanceof Error ? e : new Error(String(e)), {
        issueKey: "consultation",
        keys: { screen: "booking-confirm", ...(code ? { code } : {}) },
      });
      const detail =
        msg && !["BOOK_FAILED", "VERIFY_FAILED", "petGender"].includes(msg)
          ? msg
          : "Не удалось забронировать. Попробуйте позже.";
      setServerError(detail);
    },
  });

  const onSubmit = useCallback(() => {
    if (!slotId || !cynologistUserId) {
      Alert.alert("Ошибка", "Не хватает данных для записи.");
      return;
    }
    if (!canSubmit) {
      setShowFieldErrors(true);
      setServerError(null);
      return;
    }
    setServerError(null);
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
    bookMutation.mutate();
  }, [bookMutation, canSubmit, cynologistUserId, slotId]);

  if (bookingRestriction) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: SPACING.md, gap: SPACING.md }}>
          <Text accessibilityRole="alert" style={styles.lead}>{bookingRestriction}</Text>
          <Button label="Мои консультации" onPress={() => router.replace("/consultations/mine" as Href)} />
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
              disabled={bookMutation.isPending}
            />
            <PaperButton
              mode="contained"
              onPress={onSubmit}
              loading={bookMutation.isPending}
              disabled={bookMutation.isPending}
              style={[
                styles.actionButton,
                !canSubmit && !bookMutation.isPending ? styles.bookBtnInactive : null,
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