import { useScreenDataReady } from "@/shared/lib/telemetry/useScreenDataReady";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, InteractionManager, Pressable, ScrollView, View } from "react-native";
import { Text } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { MediaPickerError, pickMedia } from "@/shared/lib/media/mediaPicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import petDogAvatarImage from "../../../assets/images/pet-avatar-dog.png";
import petCatAvatarImage from "../../../assets/images/pet-avatar-cat.png";
import petWeightIcon from "../../../assets/images/pet-weight-icon.png";
import { FONTS } from "@/shared/config";
import { useMobileOnboardingTourStore, type MobileOnboardingTourTargetId } from "@/features/onboarding-tour";
import { TourTarget, useTourTargets } from "@/shared/lib/tour-targets";
import { Button } from "@/shared/components/ui";
import { TexturedSafeAreaView } from "@/shared/components";
import { trackEvent } from "@/shared/lib/analytics";
import { petsQueryOptions, petListForActor, verifiedPetsActor, isCurrentPetsActor, type PetsReadActor } from "@/shared/lib/api/profileTabQueries";
import { petsApi, type Pet } from "@/shared/lib/api/pets";
import { PetProfileVisibility } from "@/features/pets/PetProfileVisibility";
import { PetWeightSection } from "@/features/pets/PetWeightSection";
import { PetVetVisitShortcut } from "@/features/pets/PetVetVisits";
import { useAuthStore } from "@/shared/stores/authStore";
import { reportClientError } from "@/shared/lib/error-reporting";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { styles, declOfNum } from "@/features/pets/petTabPresentation";
import { PetPreventionSection } from "@/features/pets/PetPreventionSection";
import { PetDocumentsSection } from "@/features/pets/PetDocumentsSection";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const PET_PHOTO_MAX_SIZE_MB = 2;

const TOUR_TARGET_TOP_INSET = 116;

const TOUR_TARGET_BOTTOM_RESERVED = 320;

const TOUR_TARGET_SCROLL_RETRY_MS = 120;


const getPetTypeLabel = (type: string) => {
  switch (type) {
    case "DOG":
      return "Собака";
    case "CAT":
      return "Кошка";
    default:
      return type;
  }
};


const getAgeWithMonths = (
  birthDateString: string | null,
): { years: number; months: number } | null => {
  if (!birthDateString) return null;
  try {
    const birthDate = new Date(birthDateString);
    const now = new Date();
    const birthUTC = new Date(
      Date.UTC(birthDate.getFullYear(), birthDate.getMonth(), birthDate.getDate()),
    );
    const nowUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    let years = nowUTC.getUTCFullYear() - birthUTC.getUTCFullYear();
    let months = nowUTC.getUTCMonth() - birthUTC.getUTCMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    return { years, months };
  } catch {
    reportClientError(new Error("parse_pet_birth_date"), {
      severity: "warning",
      issueKey: "PetsScreen",
      keys: { operation: "parse_pet_birth_date" },
    });
    return null;
  }
};


export default function PetsTabScreen() {
  const ownerId = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const verified = verifiedPetsActor();
  const actor = ownerId && verified?.ownerId === ownerId ? verified : null;
  const queryClient = useQueryClient();
  const actorKey = actor ? `${actor.ownerId}:${actor.authEpoch}` : "guest";
  const previousActor = useRef<PetsReadActor | null>(null);
  useEffect(() => {
    const previous = previousActor.current;
    previousActor.current = actor;
    if (previous && (!actor || previous.ownerId !== actor.ownerId || previous.authEpoch !== actor.authEpoch)) {
      // Private documents and prevention are keyed by the exact former actor;
      // purge only that actor's queries, never a new owner's pending request.
      queryClient.removeQueries({ predicate: ({ queryKey: key }) =>
        (key[0] === "pets" && key[1] === "documents" && key[3] === previous.ownerId && key[4] === previous.authEpoch) ||
        (key[0] === "petPrevention" && key[2] === previous.ownerId && key[3] === previous.authEpoch),
      });
      // One shared ["pets"] query is consumed by Tour, prefetch and optimistic writers.
      // Drop any old in-flight/cache snapshot before the next actor read.
      void queryClient.resetQueries({ queryKey: petsQueryOptions.queryKey, exact: true });
    }
  }, [actorKey, queryClient]);
  if (!actor) return (
    <TexturedSafeAreaView style={styles.safeArea} edges={[]}>
      <Text accessibilityRole="alert">Для просмотра питомцев войдите в аккаунт.</Text>
    </TexturedSafeAreaView>
  );
  return <ActorPetsTabScreen key={`${actor.ownerId}:${actor.authEpoch}`} actor={actor} />;
}


function ActorPetsTabScreen({actor}: {actor: PetsReadActor}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { measureTarget } = useTourTargets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const scrollLayoutHeightRef = useRef(0);
  const tourIsActive = useMobileOnboardingTourStore((s) => s.isActive);
  const tourStepId = useMobileOnboardingTourStore((s) => s.currentStepId);
  const { data: petsData, refetch: refetchPets, isPending: isPetsPending,
    isError: isPetsError } = useQuery({ ...petsQueryOptions, enabled: isCurrentPetsActor(actor),
  });
  const petsRefetchFlight = useRef(false);
  // An old confirmation or a delayed DELETE ACK must not mutate another session.
  const deleteScreenLive = useRef(true);
  const deleteInFlight = useRef(false);
  useEffect(() => {
    deleteScreenLive.current = true;
    return () => { deleteScreenLive.current = false; };
  }, []);
  const currentDeleteActor = (captured: PetsReadActor) =>
    deleteScreenLive.current && isCurrentPetsActor(captured);
  const refetchCurrentPets = useCallback(() => {
    if (petsRefetchFlight.current || !isCurrentPetsActor(actor)) return;
    if (queryClient.getQueryState(petsQueryOptions.queryKey)?.fetchStatus === "fetching") return;
    petsRefetchFlight.current = true;
    void refetchPets({ cancelRefetch: false }).finally(() => {
      petsRefetchFlight.current = false;
    });
  }, [actor, queryClient, refetchPets]);
  useFocusEffect(useCallback(() => { refetchCurrentPets(); }, [refetchCurrentPets]));
  const verifiedPets = petListForActor(petsData, isCurrentPetsActor(actor) ? actor : null);
  const pets = verifiedPets ?? [];
  const showPetsError = isPetsError && isCurrentPetsActor(actor);
  const showPetsLoading = !showPetsError && (isPetsPending || verifiedPets === null);
  useScreenDataReady("SCREEN_PETS_DATA_READY",
    isCurrentPetsActor(actor) && !showPetsLoading && !showPetsError && verifiedPets !== null);
  const [expandedPetIds, setExpandedPetIds] = useState<string[]>([]);
  const trackPetsClick = useCallback((elementId: string) => {
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/pets-tab",
      elementId,
    });
  }, []);

  const deleteMutation = useMutation({
    mutationFn: ({ id, captured }: { id: string; captured: PetsReadActor }) => {
      if (!currentDeleteActor(captured))
        return Promise.resolve({ success: false, code: "SESSION_CHANGED" });
      return petsApi.delete(id, () => currentDeleteActor(captured));
    },
    onSuccess: (result, variables) => {
      if (!currentDeleteActor(variables.captured)) return;
      if (!result.success) {
        trackPetsClick("pet-delete-fail");
        // Server error text may contain another owner's private details.
        Alert.alert("Ошибка", "Не удалось удалить питомца. Проверьте список перед повтором.");
        return;
      }
      trackPetsClick("pet-delete-success");
      void queryClient.invalidateQueries({ queryKey: ["pets"] });
      void hapticFeedback.success();
    },
    onError: (_error, variables) => {
      if (!currentDeleteActor(variables.captured)) return;
      trackPetsClick("pet-delete-fail");
      // Lost DELETE ACK is uncertain: do not encourage an immediate duplicate.
      Alert.alert("Ошибка", "Не удалось подтвердить удаление. Проверьте список питомцев.");
    },
    onSettled: () => { deleteInFlight.current = false; },
  });

  const petPhotoUploadMutation = useMutation({
    mutationFn: async ({
      petId,
      uri,
      mimeType,
      fileName,
      captured,
    }: {
      petId: string;
      uri: string;
      mimeType: string;
      fileName: string;
      captured: PetsReadActor;
    }) => petsApi.uploadPhoto(petId, uri, mimeType, fileName, () => currentDeleteActor(captured)),
    onSuccess: (result, variables) => {
      if (!currentDeleteActor(variables.captured)) return;
      if (result.success) {
        trackPetsClick("pet-photo-upload-success");
        queryClient.invalidateQueries({ queryKey: ["pets"] });
        hapticFeedback.success();
      } else {
        trackPetsClick("pet-photo-upload-fail");
        Alert.alert("Ошибка", result.error ?? "Не удалось загрузить фото");
      }
    },
    onError: (error, variables) => {
      if (!currentDeleteActor(variables.captured)) return;
      trackPetsClick("pet-photo-upload-fail");
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось загрузить фото");
    },
  });

  const handleEditPet = (pet: Pet) => {
    router.push({
      pathname: "/pets/edit/[id]",
      params: { id: pet.id },
    });
  };

  const handleDeletePet = (pet: Pet) => {
    if (!currentDeleteActor(actor) || deleteInFlight.current) return;
    trackPetsClick("pet-delete-click");
    Alert.alert("Удалить питомца", `Вы уверены, что хотите удалить ${pet.name}?`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          if (!currentDeleteActor(actor) || deleteInFlight.current) return;
          deleteInFlight.current = true;
          deleteMutation.mutate({ id: pet.id, captured: actor });
        },
      },
    ]);
  };

  const pickImageAndUploadPetPhoto = async (petId: string) => {
    if (!currentDeleteActor(actor)) return;
    trackPetsClick("pet-photo-upload-click");
    try {
      const result = await pickMedia({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      }, {
        onPermissionDenied: () => Alert.alert("Доступ", "Нужен доступ к фото для загрузки"),
      });
      if (!currentDeleteActor(actor) || result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const fileSize = asset.fileSize ?? 0;
      const mimeType = asset.mimeType ?? "";
      if (fileSize > PET_PHOTO_MAX_SIZE_MB * 1024 * 1024) {
        Alert.alert("Ошибка", `Размер файла не должен превышать ${PET_PHOTO_MAX_SIZE_MB}MB`);
        return;
      }
      if (mimeType && !ALLOWED_IMAGE_TYPES.includes(mimeType)) {
        Alert.alert("Ошибка", "Поддерживаются только JPG, PNG, WEBP или GIF");
        return;
      }
      const ext = mimeType.split("/")[1] || "jpg";
      const fileName = `pet_${Date.now()}.${ext}`;
      petPhotoUploadMutation.mutate({ petId, uri: asset.uri, mimeType, fileName, captured: actor });
    } catch (err) {
      if (!currentDeleteActor(actor)) return;
      reportClientError(err, {
        issueKey: "PetsScreen",
        keys: { operation: "pick_pet_photo" },
      });
      Alert.alert("Ошибка", err instanceof MediaPickerError ? err.message : "Не удалось выбрать фото");
    }
  };

  const getPetsTourTargetId = useCallback((): MobileOnboardingTourTargetId | null => {
    if (tourStepId === "add-pet") return "pets-add-button";
    if (tourStepId === "prevention") return "pet-prevention-section";
    if (tourStepId === "documents") return "pet-documents-section";
    return null;
  }, [tourStepId]);

  const scrollToTourTarget = useCallback(
    async (animated: boolean) => {
      if (!tourIsActive || pets.length === 0) return;
      const targetId = getPetsTourTargetId();
      if (!targetId) return;

      const rect = await measureTarget(targetId);
      if (!rect) return;

      const viewportHeight = scrollLayoutHeightRef.current;
      if (viewportHeight <= 0) return;

      const visibleTop = TOUR_TARGET_TOP_INSET;
      const visibleBottom = Math.max(visibleTop + 40, viewportHeight - TOUR_TARGET_BOTTOM_RESERVED);

      let nextOffset = scrollOffsetRef.current;
      const targetTop = rect.y;
      const targetBottom = rect.y + rect.height;

      if (targetTop < visibleTop) {
        nextOffset = Math.max(0, scrollOffsetRef.current - (visibleTop - targetTop) - 12);
      } else if (targetBottom > visibleBottom) {
        nextOffset = Math.max(0, scrollOffsetRef.current + (targetBottom - visibleBottom) + 12);
      } else {
        return;
      }

      scrollRef.current?.scrollTo({ y: nextOffset, animated });
    },
    [getPetsTourTargetId, measureTarget, pets.length, tourIsActive],
  );

  useEffect(() => {
    if (!tourIsActive || pets.length === 0) return;

    const timeoutHandles: ReturnType<typeof setTimeout>[] = [];
    const interaction = InteractionManager.runAfterInteractions(() => {
      const timeout = setTimeout(() => {
        void scrollToTourTarget(true);
        const retry = setTimeout(() => {
          void scrollToTourTarget(false);
        }, TOUR_TARGET_SCROLL_RETRY_MS);
        timeoutHandles.push(retry);
      }, 120);
      timeoutHandles.push(timeout);
    });

    return () => {
      interaction.cancel();
      timeoutHandles.forEach(clearTimeout);
    };
  }, [pets.length, scrollToTourTarget, tourIsActive]);

  return (
    <TexturedSafeAreaView style={styles.safeArea} edges={[]}>
      <StatusBar style="dark" />
      <ScrollView
        ref={scrollRef}
        onLayout={(event) => {
          scrollLayoutHeightRef.current = event.nativeEvent.layout.height;
        }}
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={() => {
          if (tourIsActive) {
            setTimeout(() => {
              void scrollToTourTarget(false);
            }, 0);
          }
        }}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require("../../../assets/images/pets-header.png")}
          style={styles.headerImage}
          contentFit="cover"
          accessible
          accessibilityLabel="Питомцы. Здоровье, документы и важные записи питомцев"
        />
        <View style={styles.petsContent}>
          {showPetsLoading ? (
            <View style={styles.emptyStateWrap}>
              <Text accessibilityRole="alert">Загружаем питомцев…</Text>
            </View>
          ) : showPetsError ? (
            <View style={styles.emptyStateWrap}>
              <Text accessibilityRole="alert">Не удалось загрузить список питомцев.</Text>
              <Button label="Повторить загрузку питомцев" onPress={refetchCurrentPets} />
            </View>
          ) : pets.length === 0 ? (
            <View style={styles.emptyStateWrap}>
              <View style={styles.emptyCard}>
                <Image
                  source={require("../../../assets/images/pets-empty.webp")}
                  style={styles.emptyIcon}
                  contentFit="contain"
                  accessible={false}
                />
                <Text style={styles.noPets}>Питомцы пока не добавлены</Text>
                <Text style={styles.emptyStateHint}>
                  Добавьте питомца, чтобы записывать прививки, ставить напоминания и хранить
                  документы по вашему питомцу.
                </Text>
              </View>
              <TourTarget id="pets-add-button">
                <Button
                  label="Добавить питомца"
                  style={styles.addPetButton}
                  onPress={() => {
                    trackPetsClick("pet-add-open");
                    router.push({ pathname: "/pets/add" });
                  }}
                />
              </TourTarget>
            </View>
          ) : (
            <View style={styles.petsList}>
              {pets.map((pet, index) => {
                const isExpanded =
                  expandedPetIds.includes(pet.id) ||
                  (index === 0 &&
                    tourIsActive &&
                    (tourStepId === "prevention" || tourStepId === "documents"));
                const age = getAgeWithMonths(pet.birthDate);
                const ageLabel = age
                  ? `${age.years ? `${age.years} ${declOfNum(age.years, ["год", "года", "лет"])} ` : ""}${age.months ? `${age.months} ${declOfNum(age.months, ["месяц", "месяца", "месяцев"])}` : ""}`.trim()
                  : null;
                return (
                  <View key={pet.id} style={styles.petItem}>
                    <LinearGradient
                      colors={pet.type === "CAT" ? ["#F4D6C9", "#FFFAF0"] : ["#E1EACB", "#FFFAF0"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0.55 }}
                      style={styles.petMainInfo}
                    >
                      <Pressable
                        onPress={() => pickImageAndUploadPetPhoto(pet.id)}
                        disabled={petPhotoUploadMutation.isPending}
                        style={styles.petAvatarPressable}
                        accessibilityRole="button"
                        accessibilityLabel={`Изменить фотографию питомца ${pet.name}`}
                      >
                        {pet.photoUrl ? (
                          <Image
                            source={{ uri: pet.photoUrl }}
                            style={styles.petAvatar}
                            contentFit="cover"
                          />
                        ) : (
                          <Image
                            source={pet.type === "CAT" ? petCatAvatarImage : petDogAvatarImage}
                            style={styles.petAvatar}
                            contentFit="cover"
                            contentPosition="center"
                          />
                        )}
                        <View style={styles.petAvatarEditBadge}>
                          <MaterialCommunityIcons name="pencil-outline" size={14} color="#F6F0DF" />
                        </View>
                      </Pressable>
                      <View style={styles.petInfo}>
                        <View style={styles.petHeroTop}>
                          <Text
                            style={[styles.petSpecies, pet.type === "CAT" && styles.petSpeciesCat]}
                          >
                            {getPetTypeLabel(pet.type)}
                          </Text>
                          <Pressable
                            onPress={() =>
                              setExpandedPetIds((ids) =>
                                ids.includes(pet.id)
                                  ? ids.filter((id) => id !== pet.id)
                                  : [...ids, pet.id],
                              )
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`${isExpanded ? "Свернуть" : "Развернуть"} карточку питомца ${pet.name}`}
                            accessibilityState={{ expanded: isExpanded }}
                            style={styles.petToggle}
                          >
                            <MaterialCommunityIcons
                              name={isExpanded ? "chevron-up" : "chevron-down"}
                              size={25}
                              color="#40532E"
                            />
                          </Pressable>
                        </View>
                        <Text style={styles.petName} numberOfLines={1}>
                          {pet.name}
                        </Text>
                        <Text style={styles.petBreed} numberOfLines={1}>
                          {pet.breed || "Порода не указана"}
                        </Text>
                        <View style={styles.petFacts}>
                          {ageLabel ? (
                            <View style={styles.petFact}>
                              <MaterialCommunityIcons
                                name="calendar-month-outline"
                                size={14}
                                color="#53653A"
                              />
                              <Text style={styles.petFactText}>{ageLabel}</Text>
                            </View>
                          ) : null}
                          {pet.weightKg != null ? (
                            <View style={styles.petFact}>
                              <Image
                                source={petWeightIcon}
                                style={styles.factIcon}
                                contentFit="contain"
                              />
                              <Text style={styles.petFactText}>{pet.weightKg} кг</Text>
                            </View>
                          ) : null}
                          {pet.heightCm != null ? (
                            <View style={styles.petFact}>
                              <MaterialCommunityIcons
                                name="arrow-top-right"
                                size={14}
                                color="#53653A"
                              />
                              <Text style={styles.petFactText}>{pet.heightCm} см</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </LinearGradient>
                    <PetProfileVisibility pet={pet} />
                    {!isExpanded ? (
                      <Pressable
                        style={styles.petCompactFoot}
                        onPress={() => setExpandedPetIds((ids) => [...ids, pet.id])}
                        accessibilityRole="button"
                        accessibilityLabel={`Подробнее о питомце ${pet.name}`}
                      >
                        <Text style={styles.petCompactMeta}>
                          Процедуры · {pet._count?.preventionEntries ?? "—"}
                          {"   "}
                          Документы · {pet._count?.documents ?? "—"}
                        </Text>
                        <Text style={styles.petCompactMore}>Подробнее</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.petExpandedContent}>
                        {pet.neckGirthCm || pet.muzzleGirthCm || pet.bellyGirthCm || pet.notes ? (
                          <View style={styles.petExtra}>
                            <Text style={styles.petExtraTitle}>Параметры и заметки</Text>
                            {pet.neckGirthCm ? (
                              <Text style={styles.petDetail}>Обхват шеи: {pet.neckGirthCm} см</Text>
                            ) : null}
                            {pet.muzzleGirthCm ? (
                              <Text style={styles.petDetail}>
                                Обхват морды: {pet.muzzleGirthCm} см
                              </Text>
                            ) : null}
                            {pet.bellyGirthCm ? (
                              <Text style={styles.petDetail}>
                                Обхват живота: {pet.bellyGirthCm} см
                              </Text>
                            ) : null}
                            {pet.notes ? (
                              <Text style={styles.petNotes}>
                                Заметки: {pet.notes}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                        <View style={styles.petCardActions}>
                          <View style={styles.petManageActions}>
                            <Button
                              label="Изменить данные"
                              variant="primary"
                              flex={1}
                              fullWidth={false}
                              height={44}
                              fontSize={11}
                              lineHeight={15}
                              fontFamily={FONTS.montserrat}
                              fontWeight="600"
                              horizontalPadding={2}
                              verticalPadding={0}
                              borderRadius={14}
                              icon="pencil-outline"
                              animatedPress
                              onPress={() => {
                                trackPetsClick("pet-edit-open");
                                handleEditPet(pet);
                              }}
                            />
                            <Button
                              label="Удалить питомца"
                              variant="secondary"
                              flex={1}
                              fullWidth={false}
                              height={44}
                              fontSize={11}
                              lineHeight={15}
                              fontFamily={FONTS.montserrat}
                              fontWeight="600"
                              horizontalPadding={2}
                              verticalPadding={0}
                              borderRadius={14}
                              icon="trash-can-outline"
                              animatedPress
                              onPress={() => handleDeletePet(pet)}
                              accessibilityHint="Открывает подтверждение удаления питомца"
                            />
                          </View>
                          <PetPreventionSection pet={pet} actor={actor} />
                          <PetVetVisitShortcut petId={pet.id} />
                          <PetWeightSection petId={pet.id} />
                          <PetDocumentsSection pet={pet} actor={actor} />
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          {pets.length > 0 ? (
            <TourTarget id="pets-add-button">
              <Button
                label="Добавить питомца"
                style={styles.addPetButton}
                onPress={() => {
                  trackPetsClick("pet-add-open");
                  router.push({ pathname: "/pets/add" });
                }}
              />
            </TourTarget>
          ) : null}
        </View>
      </ScrollView>
    </TexturedSafeAreaView>
  );
}
