import { useCallback } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS, FONTS, SPACING } from "@/constants";
import { trackEvent } from "@/shared/lib/analytics";
import { petsQueryOptions } from "@/shared/lib/api/profileTabQueries";
import { petsApi, type Pet } from "@/shared/lib/api/pets";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const PET_PHOTO_MAX_SIZE_MB = 2;

const declOfNum = (n: number, forms: [string, string, string]) => {
  const cases = [2, 0, 1, 1, 1, 2];
  return forms[n % 100 > 4 && n % 100 < 20 ? 2 : cases[Math.min(n % 10, 5)]];
};

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
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: petsData } = useQuery(petsQueryOptions);
  const pets = petsData?.data || [];

  const trackPetsClick = useCallback((elementId: string) => {
    trackEvent({
      eventName: "button_click",
      platform: "mobile",
      pathOrScreen: "/pets-tab",
      elementId,
    });
  }, []);

  const deleteMutation = useMutation({
    mutationFn: petsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pets"] });
      hapticFeedback.success();
    },
    onError: (error) => {
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось удалить питомца");
    },
  });

  const petPhotoUploadMutation = useMutation({
    mutationFn: async ({
      petId,
      uri,
      mimeType,
      fileName,
    }: {
      petId: string;
      uri: string;
      mimeType: string;
      fileName: string;
    }) => petsApi.uploadPhoto(petId, uri, mimeType, fileName),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["pets"] });
        hapticFeedback.success();
      } else {
        Alert.alert("Ошибка", result.error ?? "Не удалось загрузить фото");
      }
    },
    onError: (error) => {
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
    Alert.alert("Удалить питомца", `Вы уверены, что хотите удалить ${pet.name}?`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => deleteMutation.mutate(pet.id),
      },
    ]);
  };

  const pickImageAndUploadPetPhoto = async (petId: string) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Доступ", "Нужен доступ к фото для загрузки");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
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
      petPhotoUploadMutation.mutate({ petId, uri: asset.uri, mimeType, fileName });
    } catch (err) {
      reportClientError(err, {
        issueKey: "PetsScreen",
        keys: { operation: "pick_pet_photo" },
      });
      Alert.alert("Ошибка", "Не удалось выбрать фото");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.pageTitle}>Питомцы</Text>
        {pets.length === 0 ? (
          <View style={styles.emptyStateWrap}>
            <View style={styles.emptyCard}>
              <Text style={styles.noPets}>Питомцы не добавлены</Text>
              <Text style={styles.emptyStateHint}>
                Добавьте питомца, чтобы записывать прививки, ставить напоминания и хранить
                документы по вашему питомцу.
              </Text>
            </View>
            <Pressable
              style={styles.addPetButton}
              onPress={() => {
                trackPetsClick("pet-add-open");
                router.push({ pathname: "/pets/add" });
              }}
            >
              <Text style={styles.addPetButtonText}>Добавить питомца</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.petsList}>
            {pets.map((pet) => (
              <View key={pet.id} style={styles.petItem}>
                <View style={styles.petMainInfo}>
                  <Pressable
                    onPress={() => pickImageAndUploadPetPhoto(pet.id)}
                    disabled={petPhotoUploadMutation.isPending}
                    style={styles.petAvatarPressable}
                  >
                    {pet.photoUrl ? (
                      <Image source={{ uri: pet.photoUrl }} style={styles.petAvatar} contentFit="cover" />
                    ) : (
                      <Image
                        source={require("../../../assets/images/pet-avatar.png")}
                        style={styles.petAvatar}
                        contentFit="cover"
                      />
                    )}
                    <View style={styles.petAvatarEditBadge}>
                      <Text style={styles.petAvatarEditText}>✏️</Text>
                    </View>
                  </Pressable>
                  <View style={styles.petInfo}>
                    <Text style={styles.petName}>
                      {pet.name} ({getPetTypeLabel(pet.type)})
                    </Text>
                    {pet.breed ? <Text style={styles.petDetail}>Порода: {pet.breed}</Text> : null}
                    {pet.birthDate
                      ? (() => {
                          const age = getAgeWithMonths(pet.birthDate);
                          if (!age) return null;
                          if (age.years === 0) {
                            return (
                              <Text style={styles.petDetail}>
                                Возраст: {age.months}{" "}
                                {declOfNum(age.months, ["месяц", "месяца", "месяцев"])}
                              </Text>
                            );
                          }
                          return (
                            <Text style={styles.petDetail}>
                              Возраст: {age.years} {declOfNum(age.years, ["год", "года", "лет"])}
                              {age.months > 0
                                ? ` ${age.months} ${declOfNum(age.months, ["месяц", "месяца", "месяцев"])}`
                                : ""}
                            </Text>
                          );
                        })()
                      : null}
                    {pet.heightCm ? <Text style={styles.petDetail}>Рост: {pet.heightCm} см</Text> : null}
                    {pet.weightKg ? <Text style={styles.petDetail}>Вес: {pet.weightKg} кг</Text> : null}
                    {pet.notes ? <Text style={styles.petDetail}>Заметки: {pet.notes}</Text> : null}
                  </View>
                </View>
                <View style={styles.petCardActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.petProcedureButton,
                      pressed && styles.petProcedureButtonPressed,
                    ]}
                    onPress={() => {
                      trackPetsClick("pet-prevention-open");
                      router.push(`/pets/${pet.id}/prevention` as Parameters<typeof router.push>[0]);
                    }}
                  >
                    <Text style={styles.petProcedureIcon}>📋</Text>
                    <Text style={styles.petProcedureLabel} numberOfLines={1}>
                      Записи о процедурах
                    </Text>
                  </Pressable>
                  <View style={styles.petManageActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.petManageButton,
                        pressed && styles.petActionButtonPressed,
                      ]}
                      onPress={() => {
                        trackPetsClick("pet-edit-open");
                        handleEditPet(pet);
                      }}
                    >
                      <Text style={styles.petActionIcon}>✏️</Text>
                      <Text style={styles.petActionText} numberOfLines={2}>
                        Изменить
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.petManageButton,
                        styles.petActionButtonDelete,
                        pressed && styles.petActionButtonPressed,
                      ]}
                      onPress={() => handleDeletePet(pet)}
                    >
                      <Text style={styles.petActionIcon}>🗑️</Text>
                      <Text style={[styles.petActionText, styles.petActionTextDelete]} numberOfLines={2}>
                        Удалить
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
        {pets.length > 0 ? (
          <Pressable
            style={styles.addPetButton}
            onPress={() => {
              trackPetsClick("pet-add-open");
              router.push({ pathname: "/pets/add" });
            }}
          >
            <Text style={styles.addPetButtonText}>Добавить питомца</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "400",
    color: "#352E2E",
    textAlign: "center",
    marginBottom: SPACING.md,
    fontFamily: FONTS.impact,
  },
  emptyCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  emptyStateWrap: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: SPACING.xl,
  },
  noPets: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontStyle: "normal",
    textAlign: "center",
    fontFamily: FONTS.montserrat,
  },
  emptyStateHint: {
    marginTop: SPACING.sm,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    fontFamily: FONTS.montserrat,
  },
  petsList: {
    flexDirection: "column",
    gap: SPACING.md,
  },
  petItem: {
    flexDirection: "column",
    padding: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: SPACING.xs,
  },
  petMainInfo: {
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  petAvatarPressable: {
    position: "relative",
    width: 60,
    height: 60,
  },
  petAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  petAvatarEditBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  petAvatarEditText: {
    fontSize: 10,
  },
  petInfo: {
    flex: 1,
  },
  petName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontFamily: FONTS.montserrat,
  },
  petDetail: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
    fontFamily: FONTS.montserrat,
  },
  petCardActions: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(212, 196, 168, 0.5)",
    gap: SPACING.sm,
  },
  petProcedureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 48,
  },
  petProcedureButtonPressed: {
    backgroundColor: COLORS.cardBackground,
    borderColor: COLORS.primary,
    transform: [{ scale: 0.99 }],
  },
  petProcedureIcon: {
    fontSize: 18,
    lineHeight: 22,
  },
  petProcedureLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
    letterSpacing: 0.1,
  },
  petManageActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(212, 196, 168, 0.4)",
  },
  petManageButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 56,
  },
  petActionButtonPressed: {
    backgroundColor: COLORS.cardBackground,
    borderColor: COLORS.primary,
    transform: [{ scale: 0.98 }],
  },
  petActionButtonDelete: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.borderLight,
  },
  petActionIcon: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center",
  },
  petActionText: {
    fontSize: 11,
    lineHeight: 14,
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    letterSpacing: 0.1,
    textAlign: "center",
    width: "100%",
  },
  petActionTextDelete: {
    color: "#8B4513",
  },
  addPetButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: SPACING.md,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  addPetButtonText: {
    color: COLORS.onPrimary,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    fontFamily: FONTS.impact,
  },
});
