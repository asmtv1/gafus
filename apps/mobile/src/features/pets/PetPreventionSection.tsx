import { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { Text } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import petProceduresIcon from "../../../assets/images/pet-procedures-icon.png";
import { COLORS, FONTS } from "@/shared/config";
import { TourTarget } from "@/shared/lib/tour-targets";
import { Button, Input } from "@/shared/components/ui";
import { trackEvent } from "@/shared/lib/analytics";
import { isCurrentPetsActor, type PetsReadActor } from "@/shared/lib/api/profileTabQueries";
import { petsApi, type Pet } from "@/shared/lib/api/pets";
import { PendingPreventionNotice } from "@/features/pets/PendingPreventionNotice";
import { PendingPreventionReadStatus } from "@/features/pets/PendingPreventionReadStatus";
import { usePreventionOfflineSave } from "@/features/pets/usePreventionOfflineSave";
import { useIsOffline } from "@/shared/hooks/useNetworkStatus";
import { useAuthStore } from "@/shared/stores/authStore";
import { reportClientError } from "@/shared/lib/error-reporting";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import type { CreatePreventionEntryData, PetPreventionEntry, PetPreventionReminderKind, PetPreventionType } from "@/shared/lib/api/pets";
import { styles } from "./petTabPresentation";
const DEFAULT_REMINDER_DAYS: Record<PetPreventionType, number> = {
  VACCINATION: 365,
  DEWORMING: 90,
  TICKS_FLEAS: 30,
};

const PREVENTION_TYPES: { value: PetPreventionType; label: string }[] = [
  { value: "VACCINATION", label: "Прививка" },
  { value: "DEWORMING", label: "Глистогонка" },
  { value: "TICKS_FLEAS", label: "Клещи и блохи" },
];

// Keeps the full label visible with Android font scaling while its right edge
// remains anchored by the section header's space-between layout.
const PET_SECTION_ADD_BUTTON_WIDTH = 148;


const buildPreventionPayload = (
  type: PetPreventionType,
  performedAt: string,
  productName: string,
  notes: string,
  reminderEnabled: boolean,
  reminderKind: PetPreventionReminderKind,
  reminderDaysAfter: number,
  reminderOnDate: string,
): CreatePreventionEntryData => {
  const base: CreatePreventionEntryData = {
    type,
    performedAt,
    productName: productName.trim() || undefined,
    notes: notes.trim() || undefined,
    reminderEnabled,
    reminderKind,
    reminderTimes: ["09:00"],
  };
  if (!reminderEnabled) {
    return base;
  }
  if (reminderKind === "AFTER_DAYS") {
    return { ...base, reminderDaysAfter };
  }
  return { ...base, reminderOnDate };
};


interface PetPreventionSectionProps {
  pet: Pet;
  actor: PetsReadActor;
}


export function PetPreventionSection({ pet, actor }: PetPreventionSectionProps) {
  const currentActor = useCallback(() => isCurrentPetsActor(actor), [actor]);
  const queryClient = useQueryClient();
  const isOffline = useIsOffline();
  const [showModal, setShowModal] = useState(false);
  // A verified full login can rotate authEpoch without changing user.id.
  // Subscribing to the fresh profile revision re-runs the focus read in that case.
  const verifiedProfile = useAuthStore((state) => state.user);
  const principalId = verifiedProfile?.id ?? null;
  const {
    localPending,
    pendingReadStatus,
    isSaving: isOfflineSaving,
    refreshPending,
    save: saveOffline,
    activate,
    deactivate,
  } = usePreventionOfflineSave(pet.id, principalId);
  useFocusEffect(
    useCallback(() => {
      activate();
      void refreshPending();
      return deactivate;
    }, [activate, deactivate, refreshPending, verifiedProfile]),
  );

  const [editingEntry, setEditingEntry] = useState<PetPreventionEntry | null>(null);
  const [type, setType] = useState<PetPreventionType>("VACCINATION");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().split("T")[0]);
  const [productName, setProductName] = useState("");
  const [notes, setNotes] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderKind, setReminderKind] = useState<PetPreventionReminderKind>("AFTER_DAYS");
  const [reminderDaysAfter, setReminderDaysAfter] = useState(DEFAULT_REMINDER_DAYS.VACCINATION);
  const [reminderOnDate, setReminderOnDate] = useState(new Date().toISOString().split("T")[0]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["petPrevention", pet.id, actor.ownerId, actor.authEpoch],
    enabled: currentActor(),
    queryFn: () => petsApi.getPreventionEntries(pet.id, currentActor),
  });

  const resetForm = () => {
    setType("VACCINATION");
    setPerformedAt(new Date().toISOString().split("T")[0]);
    setProductName("");
    setNotes("");
    setReminderEnabled(true);
    setReminderKind("AFTER_DAYS");
    setReminderDaysAfter(DEFAULT_REMINDER_DAYS.VACCINATION);
    setReminderOnDate(new Date().toISOString().split("T")[0]);
    setEditingEntry(null);
  };

  const addMutation = useMutation({
    mutationFn: (payload: CreatePreventionEntryData) => petsApi.addPreventionEntry(pet.id, payload, currentActor),
    onSuccess: (response) => {
      if (!currentActor()) return;
      if (!response.success) {
        Alert.alert("Ошибка", response.error ?? "Не удалось добавить запись");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["petPrevention", pet.id] });
      void queryClient.invalidateQueries({ queryKey: ["pets"], exact: true });
      hapticFeedback.success();
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      if (!currentActor()) return;
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось добавить запись");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ entryId, payload }: { entryId: string; payload: CreatePreventionEntryData }) =>
      petsApi.updatePreventionEntry(pet.id, entryId, payload, currentActor),
    onSuccess: (response) => {
      if (!currentActor()) return;
      if (!response.success) {
        Alert.alert("Ошибка", response.error ?? "Не удалось обновить запись");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["petPrevention", pet.id] });
      void queryClient.invalidateQueries({ queryKey: ["pets"], exact: true });
      hapticFeedback.success();
      setShowModal(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => petsApi.deletePreventionEntry(pet.id, entryId, currentActor),
    onSuccess: (response) => {
      if (!currentActor()) return;
      if (!response.success) {
        Alert.alert("Ошибка", response.error ?? "Не удалось удалить запись");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["petPrevention", pet.id] });
      void queryClient.invalidateQueries({ queryKey: ["pets"], exact: true });
      hapticFeedback.success();
    },
  });

  const handleOpenAdd = () => {
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/pets-tab",
      elementId: "pet-prevention-add-open",
    });
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (entry: PetPreventionEntry) => {
    setEditingEntry(entry);
    setType(entry.type);
    setPerformedAt(entry.performedAt.split("T")[0]);
    setProductName(entry.productName ?? "");
    setNotes(entry.notes ?? "");
    setReminderEnabled(entry.reminderEnabled ?? true);
    setReminderKind(entry.reminderKind ?? "AFTER_DAYS");
    setReminderDaysAfter(entry.reminderDaysAfter ?? DEFAULT_REMINDER_DAYS[entry.type]);
    setReminderOnDate(
      entry.reminderOnDate
        ? entry.reminderOnDate.split("T")[0]
        : new Date().toISOString().split("T")[0],
    );
    setShowModal(true);
  };

  const handleDelete = (entry: PetPreventionEntry) => {
    Alert.alert("Удалить запись?", "Запись будет удалена без возможности восстановления.", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => { if (currentActor()) deleteMutation.mutate(entry.id); } },
    ]);
  };

  const handleSave = () => {
    if (!currentActor()) return;
    if (!performedAt.trim()) {
      Alert.alert("Ошибка", "Дата процедуры обязательна");
      return;
    }
    if (reminderEnabled && reminderKind === "ON_DATE" && !reminderOnDate.trim()) {
      Alert.alert("Ошибка", "Укажите дату напоминания");
      return;
    }
    const payload = buildPreventionPayload(
      type,
      performedAt,
      productName,
      notes,
      reminderEnabled,
      reminderKind,
      reminderDaysAfter,
      reminderOnDate,
    );
    if (editingEntry) {
      updateMutation.mutate({ entryId: editingEntry.id, payload });
      return;
    }
    if (isOffline) {
      void saveOffline(payload, {
        onSaved: () => {
          if (!currentActor()) return;
          hapticFeedback.success();
          setShowModal(false);
          resetForm();
          Alert.alert(
            "Сохранено на устройстве",
            "Запись сохранена. При доступной сети приложение попробует синхронизировать её автоматически.",
          );
        },
        onFailed: (error) => {
          if (!currentActor()) return;
          reportClientError(error, {
            issueKey: "PreventionFreshV2",
            keys: { operation: "durable_offline_enqueue" },
          });
          Alert.alert(
            "Результат сохранения не подтверждён",
            "Не удалось подтвердить запись на устройстве. Не создавайте дубликат, проверьте сохранённые записи перед повтором.",
          );
        },
      });
      return;
    }
    addMutation.mutate(payload);
  };

  const entries = currentActor() ? data?.data ?? [] : [];
  const saving = isOfflineSaving || addMutation.isPending || updateMutation.isPending;

  return (
    <TourTarget id="pet-prevention-section">
      <View style={styles.preventionSection}>
        <View style={styles.preventionHeader}>
          <Image source={petProceduresIcon} style={styles.sectionIcon} contentFit="contain" />
          <View style={styles.preventionTitleWrap}>
            <Text style={styles.preventionTitle}>Записи о процедурах</Text>
          </View>
          <Button
            label="Добавить"
            width={PET_SECTION_ADD_BUTTON_WIDTH}
            fullWidth={false}
            height={44}
            fontFamily={FONTS.montserrat}
            fontWeight="600"
            fontSize={13}
            lineHeight={18}
            horizontalPadding={16}
            verticalPadding={10}
            borderRadius={12}
            animatedPress
            onPress={handleOpenAdd}
          />
        </View>

        <PendingPreventionNotice entries={localPending} />
        <PendingPreventionReadStatus status={pendingReadStatus} />
        {isLoading ? <Text style={styles.documentHint}>Загрузка записей...</Text> : null}
        {isError ? (
          <Text style={styles.documentError}>Не удалось загрузить записи о процедурах</Text>
        ) : null}
        {!isLoading &&
        !isError &&
        pendingReadStatus === "READY" &&
        entries.length === 0 &&
        localPending.length === 0 ? (
          <View style={styles.sectionEmptyState}>
            <Text style={styles.sectionEmptyText}>В текущей сессии записей пока нет</Text>
            <Text style={styles.documentHint}>
              Непереданные записи прошлых входов хранятся отдельно и не переносятся автоматически.
            </Text>
          </View>
        ) : null}

        {entries.length > 0 ? (
          <View style={styles.preventionList}>
            {entries.map((entry, index) => (
              <View
                key={entry.id}
                style={[styles.preventionItem, index > 0 && styles.preventionItemSeparated]}
              >
                <View style={styles.preventionItemDetails}>
                  <Text style={styles.preventionItemTitle}>
                    {PREVENTION_TYPES.find((item) => item.value === entry.type)?.label ??
                      entry.type}
                  </Text>
                  <Text style={styles.preventionItemMeta}>
                    Дата: {new Date(entry.performedAt).toLocaleDateString("ru-RU")}
                  </Text>
                  {entry.reminderEnabled && entry.remindAt ? (
                    <Text style={styles.preventionItemMeta}>
                      Напоминание: {entry.remindAt.slice(0, 10).split("-").reverse().join(".")}
                      {entry.reminderTimes?.length ? ` в ${entry.reminderTimes.join(", ")}` : ""}
                    </Text>
                  ) : null}
                  {entry.productName ? (
                    <Text style={styles.preventionItemMeta}>Препарат: {entry.productName}</Text>
                  ) : null}
                  {entry.notes ? (
                    <Text style={styles.preventionItemMeta} numberOfLines={2}>
                      {entry.notes}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.preventionItemActions}>
                  <Button
                    label="Изменить"
                    variant="primary"
                    flex={1}
                    fullWidth={false}
                    height={44}
                    fontSize={13}
                    onPress={() => handleOpenEdit(entry)}
                  />
                  <Button
                    label="Удалить"
                    variant="secondary"
                    flex={1}
                    fullWidth={false}
                    height={44}
                    fontSize={13}
                    onPress={() => handleDelete(entry)}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Modal
          visible={showModal}
          animationType="slide"
          transparent
          onRequestClose={() => {
            if (saving) return;
            setShowModal(false);
            resetForm();
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.preventionModalOverlay}
          >
            <Pressable
              style={styles.preventionModalDismiss}
              onPress={() => {
                if (saving) return;
                setShowModal(false);
                resetForm();
              }}
            />
            <View style={styles.preventionModalSheet}>
              <ScrollView
                contentContainerStyle={styles.preventionModalScroll}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.preventionModalTitle}>
                  {editingEntry ? "Изменить запись" : "Добавить запись"}
                </Text>

                <Text style={styles.preventionFieldLabel}>Тип процедуры</Text>
                <View style={styles.preventionTypeRow}>
                  {PREVENTION_TYPES.map((item) => (
                    <Button
                      key={item.value}
                      label={item.label}
                      variant={type === item.value ? "selected" : "primary"}
                      width={item.value === "TICKS_FLEAS" ? "100%" : "48.8%"}
                      fullWidth={false}
                      height={50}
                      fontSize={13}
                      lineHeight={18}
                      fontFamily={FONTS.montserratMedium}
                      horizontalPadding={6}
                      verticalPadding={0}
                      borderRadius={12}
                      animatedPress
                      onPress={() => setType(item.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: type === item.value }}
                    />
                  ))}
                </View>

                <Input
                  label="Дата процедуры *"
                  value={performedAt}
                  onChangeText={setPerformedAt}
                  placeholder="YYYY-MM-DD"
                  style={styles.preventionInput}
                />
                <Input
                  label="Препарат"
                  value={productName}
                  onChangeText={setProductName}
                  placeholder="Название (необязательно)"
                  style={styles.preventionInput}
                />
                <Input
                  label="Заметки"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Дополнительно"
                  multiline
                  numberOfLines={2}
                  keyboardDoneAccessory
                />

                <View style={styles.preventionToggleRow}>
                  <Text style={styles.preventionFieldLabelNoMargin}>Включить напоминание</Text>
                  <Switch
                    value={reminderEnabled}
                    onValueChange={setReminderEnabled}
                    trackColor={{ false: COLORS.borderLight, true: COLORS.primary }}
                    thumbColor={COLORS.surface}
                    ios_backgroundColor={COLORS.borderLight}
                    accessibilityLabel="Включить напоминание"
                  />
                </View>

                {reminderEnabled ? (
                  <>
                    <View style={[styles.preventionTypeRow, styles.preventionReminderTypeRow]}>
                      <Button
                        label="Через N дней"
                        variant={reminderKind === "AFTER_DAYS" ? "selected" : "primary"}
                        flex={1}
                        fullWidth={false}
                        height={48}
                        fontSize={13}
                        lineHeight={18}
                        fontFamily={FONTS.montserratMedium}
                        horizontalPadding={6}
                        verticalPadding={0}
                        borderRadius={12}
                        animatedPress
                        onPress={() => setReminderKind("AFTER_DAYS")}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: reminderKind === "AFTER_DAYS" }}
                      />
                      <Button
                        label="По дате"
                        variant={reminderKind === "ON_DATE" ? "selected" : "primary"}
                        flex={1}
                        fullWidth={false}
                        height={48}
                        fontSize={13}
                        lineHeight={18}
                        fontFamily={FONTS.montserratMedium}
                        horizontalPadding={6}
                        verticalPadding={0}
                        borderRadius={12}
                        animatedPress
                        onPress={() => setReminderKind("ON_DATE")}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: reminderKind === "ON_DATE" }}
                      />
                    </View>
                    {reminderKind === "AFTER_DAYS" ? (
                      <Input
                        label="Через сколько дней"
                        value={String(reminderDaysAfter)}
                        onChangeText={(value) => setReminderDaysAfter(parseInt(value, 10) || 1)}
                        keyboardType="number-pad"
                        style={styles.preventionInput}
                      />
                    ) : (
                      <Input
                        label="Дата напоминания *"
                        value={reminderOnDate}
                        onChangeText={setReminderOnDate}
                        placeholder="YYYY-MM-DD"
                        style={styles.preventionInput}
                      />
                    )}
                  </>
                ) : null}

                <View style={styles.preventionModalActions}>
                  <Button
                    label="Отмена"
                    variant="secondary"
                    flex={1}
                    fullWidth={false}
                    height={48}
                    fontFamily={FONTS.montserrat}
                    fontWeight="600"
                    fontSize={15}
                    lineHeight={20}
                    horizontalPadding={0}
                    verticalPadding={14}
                    borderRadius={10}
                    onPress={() => {
                      if (saving) return;
                      setShowModal(false);
                      resetForm();
                    }}
                    disabled={saving}
                  />
                  <Button
                    label={saving ? "Сохранение..." : "Сохранить"}
                    flex={1}
                    fullWidth={false}
                    height={48}
                    fontFamily={FONTS.montserrat}
                    fontWeight="600"
                    fontSize={15}
                    lineHeight={20}
                    horizontalPadding={0}
                    verticalPadding={14}
                    borderRadius={10}
                    onPress={handleSave}
                    disabled={saving}
                  />
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </TourTarget>
  );
}
