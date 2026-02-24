import { View, StyleSheet, ScrollView, Alert, Pressable, Linking } from "react-native";
import { Text, Avatar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";

import { Card } from "@/shared/components/ui";
import { useAuthStore } from "@/shared/stores";
import { subscriptionsApi, notesApi } from "@/shared/lib/api";
import { userApi } from "@/shared/lib/api/user";
import { petsApi, type Pet } from "@/shared/lib/api/pets";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { registerForPushNotifications, savePushToken } from "@/shared/lib/utils/notifications";
import { COLORS, SPACING, FONTS } from "@/constants";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const AVATAR_MAX_SIZE_MB = 5;
const PET_PHOTO_MAX_SIZE_MB = 2;

const WEB_BASE_URL = "https://gafus.ru";
const DOCUMENT_URLS = {
  policy: `${WEB_BASE_URL}/policy.html`,
  oferta: `${WEB_BASE_URL}/oferta.html`,
  personal: `${WEB_BASE_URL}/personal.html`,
  personalDistribution: `${WEB_BASE_URL}/personal-distribution.html`,
} as const;
const SUPPORT_TELEGRAM_URL = "https://t.me/gafus_support";
const PASSWORD_RESET_URL = `${WEB_BASE_URL}/reset-password`;

// Функция для получения инициалов
const getInitials = (name: string): string => {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

// Функция для получения возраста (только годы, для пользователя)
const getAge = (birthDate: string | null): number | null => {
  if (!birthDate) return null;
  try {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
};

// Функция для получения возраста с месяцами (как в web-версии, для питомцев)
const getAgeWithMonths = (
  birthDateString: string | null,
): { years: number; months: number } | null => {
  if (!birthDateString) return null;
  try {
    const birthDate = new Date(birthDateString);
    const now = new Date();

    // Используем UTC даты для консистентности между сервером и клиентом
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
    return null;
  }
};

// Функция для склонения
const declOfNum = (n: number, forms: [string, string, string]) => {
  const cases = [2, 0, 1, 1, 1, 2];
  return forms[n % 100 > 4 && n % 100 < 20 ? 2 : cases[Math.min(n % 10, 5)]];
};

// Функция для получения метки роли
const getRoleLabel = (role?: string) => {
  switch (role) {
    case "ADMIN":
      return "Администратор";
    case "MODERATOR":
      return "Модератор";
    case "TRAINER":
      return "Кинолог";
    case "PREMIUM":
      return "Премиум-пользователь";
    case "USER":
    default:
      return null;
  }
};

// Функция для получения цвета роли
const getRoleColor = (role?: string) => {
  switch (role) {
    case "ADMIN":
      return "#8B4513";
    case "MODERATOR":
      return "#636128";
    case "TRAINER":
      return "#352E2E";
    case "PREMIUM":
      return "#B6C582";
    default:
      return "#636128";
  }
};

// Функция для получения метки типа питомца
const getPetTypeLabel = (type: string) => {
  switch (type) {
    case "DOG":
      return "Собака";
    case "CAT":
      return "Кошка";
    case "OTHER":
      return "Другое";
    default:
      return type;
  }
};

/**
 * Страница профиля пользователя (точный дизайн как в веб-версии)
 */
export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();

  // Загрузка данных профиля
  const { data: profileData } = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => userApi.getProfile(),
  });

  // Загрузка питомцев
  const { data: petsData } = useQuery({
    queryKey: ["pets"],
    queryFn: () => petsApi.getAll(),
  });

  const { data: pushStatusData } = useQuery({
    queryKey: ["push-subscription-status"],
    queryFn: subscriptionsApi.getPushSubscriptionStatus,
  });

  const { data: studentNotesData } = useQuery({
    queryKey: ["student-notes"],
    queryFn: notesApi.getStudentNotes,
    enabled: user?.role === "USER",
  });

  const { data: trainerProfileData } = useQuery({
    queryKey: ["trainer-public-profile", user?.username],
    queryFn: () => userApi.getPublicProfile(user?.username ?? ""),
    enabled: user?.role === "TRAINER" && !!user?.username,
  });

  // Удаление питомца
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

  // Загрузка аватара пользователя
  const avatarUploadMutation = useMutation({
    mutationFn: async ({
      uri,
      mimeType,
      fileName,
    }: {
      uri: string;
      mimeType: string;
      fileName: string;
    }) => userApi.uploadAvatar(uri, mimeType, fileName),
    onSuccess: (result) => {
      if (result.success && result.data?.avatarUrl) {
        // Сразу подставляем URL с CDN в кэш, чтобы аватар отобразился без ожидания refetch
        queryClient.setQueryData(["user-profile"], (old: Awaited<ReturnType<typeof userApi.getProfile>> | undefined) => {
          if (!old?.data) return old;
          const url = result.data!.avatarUrl;
          return {
            ...old,
            data: {
              ...old.data,
              profile: {
                ...(old.data.profile ?? {}),
                avatarUrl: url,
              },
            },
          };
        });
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        hapticFeedback.success();
      } else if (!result.success) {
        Alert.alert("Ошибка", result.error ?? "Не удалось загрузить аватар");
      } else {
        hapticFeedback.success();
      }
    },
    onError: (error) => {
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось загрузить аватар");
    },
  });

  // Загрузка фото питомца
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

  const enablePushMutation = useMutation({
    mutationFn: async () => {
      const token = await registerForPushNotifications();
      if (!token) return { success: false, error: "Разрешение на push не получено" };
      const saved = await savePushToken(token);
      return saved ? { success: true } : { success: false, error: "Не удалось сохранить push token" };
    },
    onSuccess: async (result) => {
      if (!result.success) {
        Alert.alert("Уведомления", result.error ?? "Не удалось включить уведомления");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["push-subscription-status"] });
      hapticFeedback.success();
    },
  });

  const disablePushMutation = useMutation({
    mutationFn: () => subscriptionsApi.deleteAllPushSubscriptions(),
    onSuccess: async (result) => {
      if (!result.success) {
        Alert.alert("Уведомления", result.error ?? "Не удалось отключить уведомления");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["push-subscription-status"] });
      hapticFeedback.success();
    },
  });

  const profile = profileData?.data?.profile;
  const avatarUrl = profile?.avatarUrl?.trim() || null;
  const pets = petsData?.data || [];
  const displayRole = getRoleLabel(user?.role);
  const hasPushSubscription = !!pushStatusData?.data?.hasSubscription;
  const studentNotes = studentNotesData?.success ? (studentNotesData.data ?? []) : [];
  const trainerCourses = trainerProfileData?.data?.courses ?? [];

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
  const roleColor = getRoleColor(user?.role);

  const handleLogout = () => {
    Alert.alert("Выход из аккаунта", "Вы уверены, что хотите выйти?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Выйти",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const age = profile?.birthDate ? getAge(profile.birthDate) : null;
  const hasSocialLinks = profile?.instagram || profile?.telegram || profile?.website;

  const pickImageAndUploadAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Доступ", "Нужен доступ к фото для смены аватара");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? "image/jpeg";
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      Alert.alert("Ошибка", "Разрешены только JPEG, PNG, WebP, GIF");
      return;
    }
    const sizeMB = (asset.fileSize ?? 0) / (1024 * 1024);
    if (sizeMB > AVATAR_MAX_SIZE_MB) {
      Alert.alert("Ошибка", `Максимальный размер аватара — ${AVATAR_MAX_SIZE_MB} МБ`);
      return;
    }
    const fileName = asset.uri.split("/").pop() ?? "photo.jpg";
    avatarUploadMutation.mutate({ uri: asset.uri, mimeType, fileName });
  };

  const pickImageAndUploadPetPhoto = async (petId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Доступ", "Нужен доступ к фото для смены фото питомца");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? "image/jpeg";
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      Alert.alert("Ошибка", "Разрешены только JPEG, PNG, WebP, GIF");
      return;
    }
    const sizeMB = (asset.fileSize ?? 0) / (1024 * 1024);
    if (sizeMB > PET_PHOTO_MAX_SIZE_MB) {
      Alert.alert("Ошибка", `Максимальный размер фото — ${PET_PHOTO_MAX_SIZE_MB} МБ`);
      return;
    }
    const fileName = asset.uri.split("/").pop() ?? "photo.jpg";
    petPhotoUploadMutation.mutate({ petId, uri: asset.uri, mimeType, fileName });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Заголовок */}
        <Text style={styles.title}>Профиль {user?.username}</Text>

        {/* Баннер профиля (оливковый фон) */}
        <View style={styles.profileBanner}>
          <Pressable
            style={styles.avatarContainer}
            onPress={pickImageAndUploadAvatar}
            disabled={avatarUploadMutation.isPending}
          >
            <View style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Avatar.Image size={95} source={{ uri: avatarUrl }} />
              ) : (
                <Avatar.Image
                  size={95}
                  source={require("../../../assets/images/avatar.png")}
                />
              )}
            </View>
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditText}>✏️</Text>
            </View>
          </Pressable>
          <View style={styles.profileInfo}>
            <Text style={styles.greeting}>Привет, {profile?.fullName || user?.username}!</Text>
            <Text style={styles.contactInfo}>
              {user?.phone
                ? user.phone
                : profile?.telegram
                  ? `@${profile.telegram}`
                  : "Контакты не указаны"}
            </Text>
            {displayRole && (
              <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                <Text style={styles.roleText}>{displayRole}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Контейнер с информацией о себе */}
        <View style={styles.infoContainer}>
          {age !== null && (
            <Text style={styles.infoText}>
              Возраст: {age} {declOfNum(age, ["год", "года", "лет"])}
            </Text>
          )}

          {/* О себе */}
          {(profile?.about || !age) && (
            <View style={styles.aboutContainer}>
              <Text style={styles.aboutTitle}>О СЕБЕ</Text>
              {profile?.about ? (
                <View style={styles.aboutCard}>
                  <Text style={styles.aboutText}>{profile.about}</Text>
                </View>
              ) : (
                <Text style={styles.emptyNotice}>Информация о себе не внесена</Text>
              )}
            </View>
          )}

          {/* Социальные сети */}
          {hasSocialLinks && (
            <View style={styles.socialLinksContainer}>
              <Text style={styles.socialLinksTitle}>КОНТАКТЫ</Text>
              <View style={styles.socialLinksList}>
                {profile?.instagram && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() => Linking.openURL(`https://instagram.com/${profile.instagram}`)}
                  >
                    <Text style={styles.socialIcon}>📷</Text>
                    <Text style={styles.socialLabel}>Instagram</Text>
                    <Text style={styles.socialUsername}>{profile.instagram}</Text>
                  </Pressable>
                )}
                {profile?.telegram && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() => Linking.openURL(`https://t.me/${profile.telegram}`)}
                  >
                    <Text style={styles.socialIcon}>✈️</Text>
                    <Text style={styles.socialLabel}>Telegram</Text>
                    <Text style={styles.socialUsername}>{profile.telegram}</Text>
                  </Pressable>
                )}
                {profile?.website && (
                  <Pressable
                    style={styles.socialLink}
                    onPress={() => Linking.openURL(profile.website!)}
                  >
                    <Text style={styles.socialIcon}>🌐</Text>
                    <Text style={styles.socialLabel}>Сайт</Text>
                    <Text style={styles.socialUsername}>{profile.website}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          <Pressable
            style={styles.editBioButton}
            onPress={() => router.push({ pathname: "/profile/edit" })}
          >
            <Text style={styles.editBioButtonText}>Внести/Изменить «О себе»</Text>
          </Pressable>

          <View style={styles.notificationsCard}>
            <Text style={styles.notificationsTitle}>Уведомления</Text>
            <Text style={styles.notificationsStatus}>
              {hasPushSubscription ? "Подписка активна" : "Подписка неактивна"}
            </Text>
            <View style={styles.notificationsActions}>
              <Pressable
                style={styles.notifyActionButton}
                onPress={() => enablePushMutation.mutate()}
              >
                <Text style={styles.notifyActionText}>Включить</Text>
              </Pressable>
              <Pressable
                style={[styles.notifyActionButton, styles.notifyActionDanger]}
                onPress={() => disablePushMutation.mutate()}
              >
                <Text style={styles.notifyActionText}>Отключить</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={styles.remindersButton}
            onPress={() => router.push({ pathname: "/reminders" })}
          >
            <Text style={styles.remindersButtonText}>Напоминания о тренировках</Text>
          </Pressable>

          {user?.role === "USER" && (
            <View style={styles.notesCard}>
              <Text style={styles.notesTitle}>Заметки тренера</Text>
              {studentNotes.length === 0 ? (
                <Text style={styles.notesEmpty}>Пока нет заметок от тренера</Text>
              ) : (
                studentNotes.map((note) => (
                  <View key={note.id} style={styles.noteItem}>
                    <Text style={styles.noteTitle}>{note.title}</Text>
                    <Text style={styles.noteMeta}>
                      {note.trainer?.profile?.fullName ?? "Тренер"} •{" "}
                      {new Date(note.createdAt).toLocaleDateString("ru-RU")}
                    </Text>
                    {note.entries.map((entry) => (
                      <Text key={entry.id} style={styles.noteContent}>
                        • {entry.content}
                      </Text>
                    ))}
                  </View>
                ))
              )}
            </View>
          )}

          {user?.role === "TRAINER" && (
            <View style={styles.notesCard}>
              <Text style={styles.notesTitle}>Курсы кинолога</Text>
              {trainerCourses.length === 0 ? (
                <Text style={styles.notesEmpty}>Курсы не найдены</Text>
              ) : (
                trainerCourses.map((course) => (
                  <Pressable
                    key={course.id}
                    style={styles.trainerCourseItem}
                    onPress={() => router.push(`/training/${course.type}`)}
                  >
                    <Text style={styles.trainerCourseTitle}>{course.name}</Text>
                    <Text style={styles.trainerCourseMeta}>{course.shortDesc}</Text>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>

        {/* Список питомцев */}
        <View style={styles.petListContainer}>
          <Text style={styles.petListTitle}>Питомцы</Text>
          {pets.length === 0 ? (
            <Text style={styles.noPets}>Питомцы не добавлены</Text>
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
                        <Image
                          source={{ uri: pet.photoUrl }}
                          style={styles.petAvatar}
                          contentFit="cover"
                        />
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
                      {pet.breed && <Text style={styles.petDetail}>Порода: {pet.breed}</Text>}
                      {pet.birthDate &&
                        (() => {
                          const age = getAgeWithMonths(pet.birthDate);
                          if (!age) return null;

                          // Показываем только месяцы и годы
                          if (age.years === 0) {
                            // Только месяцы
                            return (
                              <Text style={styles.petDetail}>
                                Возраст: {age.months}{" "}
                                {declOfNum(age.months, ["месяц", "месяца", "месяцев"])}
                              </Text>
                            );
                          } else {
                            // Годы и месяцы
                            return (
                              <Text style={styles.petDetail}>
                                Возраст: {age.years} {declOfNum(age.years, ["год", "года", "лет"])}
                                {age.months > 0 &&
                                  ` ${age.months} ${declOfNum(age.months, ["месяц", "месяца", "месяцев"])}`}
                              </Text>
                            );
                          }
                        })()}
                      {pet.heightCm && (
                        <Text style={styles.petDetail}>Рост: {pet.heightCm} см</Text>
                      )}
                      {pet.weightKg && <Text style={styles.petDetail}>Вес: {pet.weightKg} кг</Text>}
                      {pet.notes && <Text style={styles.petDetail}>Заметки: {pet.notes}</Text>}
                    </View>
                  </View>
                  <View style={styles.petActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.petActionButton,
                        pressed && styles.petActionButtonPressed,
                      ]}
                      onPress={() => handleEditPet(pet)}
                    >
                      <Text style={styles.petActionIcon}>✏️</Text>
                      <Text style={styles.petActionText} numberOfLines={1}>
                        Изменить
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.petActionButton,
                        styles.petActionButtonDelete,
                        pressed && styles.petActionButtonPressed,
                      ]}
                      onPress={() => handleDeletePet(pet)}
                    >
                      <Text style={styles.petActionIcon}>🗑️</Text>
                      <Text
                        style={[styles.petActionText, styles.petActionTextDelete]}
                        numberOfLines={1}
                      >
                        Удалить
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Pressable style={styles.addPetButton} onPress={() => router.push({ pathname: "/pets/add" })}>
            <Text style={styles.addPetButtonText}>Добавить питомца</Text>
          </Pressable>
        </View>

        {/* Кнопка смены пароля */}
        <Pressable
          style={styles.passwordButton}
          onPress={() => Linking.openURL(PASSWORD_RESET_URL)}
        >
          <Text style={styles.passwordButtonText}>🔐 Сменить пароль</Text>
        </Pressable>

        <Pressable
          style={styles.passwordButton}
          onPress={() => router.push({ pathname: "/profile/change-phone" })}
        >
          <Text style={styles.passwordButtonText}>📞 Сменить телефон</Text>
        </Pressable>

        <Pressable
          style={styles.passwordButton}
          onPress={() => router.push({ pathname: "/profile/change-username" })}
        >
          <Text style={styles.passwordButtonText}>👤 Сменить логин</Text>
        </Pressable>

        {/* Выход */}
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Выйти из аккаунта</Text>
        </Pressable>

        {/* Информация (в самом низу) */}
        <Card style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Информация</Text>

          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>О приложении</Text>
              <Text style={styles.infoItemDesc}>Версия 1.0.0</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <Pressable
            style={styles.infoItem}
            onPress={() => Linking.openURL(DOCUMENT_URLS.policy)}
          >
            <Text style={styles.infoIcon}>🔒</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Политика конфиденциальности</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable
            style={styles.infoItem}
            onPress={() => Linking.openURL(DOCUMENT_URLS.oferta)}
          >
            <Text style={styles.infoIcon}>📄</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Оферта</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable
            style={styles.infoItem}
            onPress={() => Linking.openURL(DOCUMENT_URLS.personal)}
          >
            <Text style={styles.infoIcon}>📋</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Согласие на обработку персональных данных</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable
            style={styles.infoItem}
            onPress={() => Linking.openURL(DOCUMENT_URLS.personalDistribution)}
          >
            <Text style={styles.infoIcon}>📋</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Согласие на распространение данных</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable
            style={styles.infoItem}
            onPress={() => Linking.openURL(SUPPORT_TELEGRAM_URL)}
          >
            <Text style={styles.infoIcon}>💬</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoItemTitle}>Связаться с поддержкой</Text>
            </View>
            <Text style={styles.infoArrow}>→</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  title: {
    fontSize: 28,
    fontWeight: "400",
    color: "#352E2E",
    textAlign: "center",
    marginBottom: SPACING.md,
    fontFamily: FONTS.impact,
  },
  // Баннер профиля (оливковый фон)
  profileBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    width: "100%",
    backgroundColor: "#636128",
    borderRadius: 12,
    paddingVertical: SPACING.sm + 10,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarContainer: {
    position: "relative",
    width: 105,
    height: 105,
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrapper: {
    width: 105,
    height: 105,
    borderRadius: 53,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    backgroundColor: COLORS.primary,
  },
  avatarEditBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEditText: {
    fontSize: 14,
  },
  profileInfo: {
    flex: 1,
    flexDirection: "column",
    gap: 4,
  },
  greeting: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ECE5D2",
    fontFamily: FONTS.impact,
    lineHeight: 20,
  },
  contactInfo: {
    fontSize: 13,
    color: "#D4C4A8",
    fontFamily: FONTS.montserrat,
    opacity: 0.9,
  },
  roleBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  roleText: {
    color: "#ECE5D2",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: FONTS.impact,
  },
  // Контейнер с информацией о себе
  infoContainer: {
    width: "100%",
    padding: SPACING.md,
    backgroundColor: "#F5F0E8",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    marginBottom: SPACING.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoText: {
    fontSize: 14,
    color: "#352E2E",
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: "#ECE5D2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    fontFamily: FONTS.montserrat,
  },
  emptyNotice: {
    backgroundColor: "#FFF8E5",
    color: "#636128",
    padding: SPACING.md,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D4C4A8",
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: SPACING.sm,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  editBioButton: {
    backgroundColor: "#636128",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: SPACING.sm,
    shadowColor: "#636128",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  editBioButtonText: {
    color: "#ECE5D2",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    fontFamily: FONTS.impact,
  },
  notificationsCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 12,
    backgroundColor: "#ECE5D2",
  },
  notificationsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#352E2E",
    fontFamily: FONTS.impact,
  },
  notificationsStatus: {
    marginTop: 6,
    color: "#636128",
    fontFamily: FONTS.montserrat,
  },
  notificationsActions: {
    marginTop: SPACING.sm,
    flexDirection: "row",
    gap: SPACING.sm,
  },
  notifyActionButton: {
    flex: 1,
    backgroundColor: "#636128",
    borderRadius: 8,
    alignItems: "center",
    paddingVertical: 8,
  },
  notifyActionDanger: {
    backgroundColor: "#8B4513",
  },
  notifyActionText: {
    color: "#ECE5D2",
    fontFamily: FONTS.impact,
    fontSize: 13,
  },
  remindersButton: {
    backgroundColor: "#352E2E",
    borderRadius: 12,
    marginTop: SPACING.sm,
    paddingVertical: 10,
    alignItems: "center",
  },
  remindersButtonText: {
    color: "#ECE5D2",
    fontFamily: FONTS.impact,
    fontSize: 14,
  },
  notesCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 12,
    backgroundColor: "#ECE5D2",
    gap: SPACING.sm,
  },
  notesTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#352E2E",
    fontFamily: FONTS.impact,
  },
  notesEmpty: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  noteItem: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 10,
    padding: SPACING.sm,
  },
  noteTitle: {
    fontWeight: "700",
    color: "#352E2E",
  },
  noteMeta: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  noteContent: {
    marginTop: 4,
    color: "#352E2E",
  },
  trainerCourseItem: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 10,
    padding: SPACING.sm,
  },
  trainerCourseTitle: {
    fontWeight: "700",
    color: "#352E2E",
  },
  trainerCourseMeta: {
    color: COLORS.textSecondary,
    marginTop: 4,
    fontSize: 12,
  },
  // О себе
  aboutContainer: {
    width: "100%",
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: "#ECE5D2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  aboutTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: SPACING.sm,
    fontFamily: FONTS.impact,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  aboutCard: {
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    minHeight: 44,
  },
  aboutText: {
    fontSize: 14,
    color: "#352E2E",
    fontFamily: FONTS.montserrat,
    lineHeight: 20,
  },
  // Социальные сети
  socialLinksContainer: {
    width: "100%",
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: "#ECE5D2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  socialLinksTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: SPACING.sm,
    fontFamily: FONTS.impact,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  socialLinksList: {
    flexDirection: "column",
    gap: SPACING.sm,
  },
  socialLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    minHeight: 44,
  },
  socialIcon: {
    fontSize: 20,
  },
  socialLabel: {
    fontWeight: "600",
    color: "#636128",
    minWidth: 80,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  socialUsername: {
    color: "#352E2E",
    flex: 1,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  // Список питомцев
  petListContainer: {
    width: "100%",
    marginBottom: SPACING.lg,
    backgroundColor: "#F5F0E8",
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 12,
    padding: SPACING.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  petListTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: SPACING.md,
    fontFamily: FONTS.impact,
  },
  noPets: {
    color: "#636128",
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    padding: SPACING.md,
    fontFamily: FONTS.montserrat,
  },
  petsList: {
    flexDirection: "column",
    gap: SPACING.md,
  },
  petItem: {
    flexDirection: "column",
    padding: SPACING.md,
    backgroundColor: "#ECE5D2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    marginBottom: SPACING.sm,
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
  petAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  petAvatarText: {
    fontSize: 24,
  },
  petInfo: {
    flex: 1,
  },
  petName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: SPACING.xs,
    fontFamily: FONTS.montserrat,
  },
  petDetail: {
    fontSize: 12,
    color: "#352E2E",
    marginBottom: 2,
    fontFamily: FONTS.montserrat,
  },
  petActions: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(212, 196, 168, 0.5)",
  },
  petActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    backgroundColor: "#FFF8E5",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 36,
  },
  petActionButtonPressed: {
    backgroundColor: "#F5F0E8",
    borderColor: "#B6C582",
    transform: [{ scale: 0.98 }],
  },
  petActionButtonDelete: {
    backgroundColor: "#FFF8E5",
    borderColor: "#D4C4A8",
  },
  petActionIcon: {
    fontSize: 14,
  },
  petActionText: {
    fontSize: 12,
    color: "#636128",
    fontFamily: FONTS.montserrat,
    fontWeight: "600",
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  petActionTextDelete: {
    color: "#8B4513",
  },
  addPetButton: {
    backgroundColor: "#636128",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: SPACING.md,
    shadowColor: "#636128",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  addPetButtonText: {
    color: "#ECE5D2",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    fontFamily: FONTS.impact,
  },
  passwordButton: {
    backgroundColor: "#636128",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: "#636128",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  passwordButtonText: {
    color: "#ECE5D2",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FONTS.impact,
  },
  logoutButton: {
    backgroundColor: "#636128",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    shadowColor: "#636128",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  logoutButtonText: {
    color: "#ECE5D2",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FONTS.impact,
  },
  // Информация (в самом низу)
  infoCard: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    fontFamily: FONTS.impact,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: SPACING.md,
    width: 24,
  },
  infoContent: {
    flex: 1,
  },
  infoItemTitle: {
    fontSize: 14,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  infoItemDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontFamily: FONTS.montserrat,
  },
  infoArrow: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  infoDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: SPACING.md,
  },
});
