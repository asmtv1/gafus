import { View, StyleSheet, ScrollView, Alert, Pressable, Linking } from "react-native";
import { Text, Avatar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";

import { Button, Card } from "@/shared/components/ui";
import { useAuthStore } from "@/shared/stores";
import { userApi } from "@/shared/lib/api/user";
import { petsApi, type Pet } from "@/shared/lib/api/pets";
import { COLORS, SPACING, BORDER_RADIUS, FONTS } from "@/constants";

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
const getAgeWithMonths = (birthDateString: string | null): { years: number; months: number } | null => {
  if (!birthDateString) return null;
  try {
    const birthDate = new Date(birthDateString);
    const now = new Date();
    
    // Используем UTC даты для консистентности между сервером и клиентом
    const birthUTC = new Date(Date.UTC(birthDate.getFullYear(), birthDate.getMonth(), birthDate.getDate()));
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

  const profile = profileData?.data?.profile;
  const pets = petsData?.data || [];
  const displayRole = getRoleLabel(user?.role);
  const roleColor = getRoleColor(user?.role);

  const handleLogout = () => {
    Alert.alert(
      "Выход из аккаунта",
      "Вы уверены, что хотите выйти?",
      [
        { text: "Отмена", style: "cancel" },
        { 
          text: "Выйти", 
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/login");
          },
        },
      ]
    );
  };

  const age = profile?.birthDate ? getAge(profile.birthDate) : null;
  const hasSocialLinks = profile?.instagram || profile?.telegram || profile?.website;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Обёртка как в веб-версии */}
        <View style={styles.wrapper}>
          {/* Заголовок */}
          <Text style={styles.title}>Профиль {user?.username}</Text>

          {/* Баннер профиля (оливковый фон) */}
          <View style={styles.profileBanner}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatarWrapper}>
                {profile?.avatarUrl ? (
                  <Avatar.Image
                    size={50}
                    source={{ uri: profile.avatarUrl }}
                  />
                ) : (
                  <Avatar.Text
                    size={50}
                    label={getInitials(profile?.fullName || user?.username || "U")}
                  />
                )}
              </View>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.greeting}>
                Привет, {profile?.fullName || user?.username}!
              </Text>
              <Text style={styles.contactInfo}>
                {user?.phone || profile?.telegram ? `@${profile?.telegram || ""}` : "Контакты не указаны"}
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
              onPress={() => router.push("/profile/edit" as any)}
            >
              <Text style={styles.editBioButtonText}>Внести/Изменить «О себе»</Text>
            </Pressable>
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
                    {pet.photoUrl ? (
                      <Image
                        source={{ uri: pet.photoUrl }}
                        style={styles.petAvatar}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.petAvatarPlaceholder}>
                        <Text style={styles.petAvatarText}>🐾</Text>
                      </View>
                    )}
                    <View style={styles.petInfo}>
                      <Text style={styles.petName}>
                        {pet.name} ({getPetTypeLabel(pet.type)})
                      </Text>
                      {pet.breed && <Text style={styles.petDetail}>Порода: {pet.breed}</Text>}
                      {pet.birthDate && (() => {
                        const age = getAgeWithMonths(pet.birthDate);
                        if (!age) return null;
                        
                        // Показываем только месяцы и годы
                        if (age.years === 0) {
                          // Только месяцы
                          return (
                            <Text style={styles.petDetail}>
                              Возраст: {age.months} {declOfNum(age.months, ["месяц", "месяца", "месяцев"])}
                            </Text>
                          );
                        } else {
                          // Годы и месяцы
                          return (
                            <Text style={styles.petDetail}>
                              Возраст: {age.years} {declOfNum(age.years, ["год", "года", "лет"])}
                              {age.months > 0 && ` ${age.months} ${declOfNum(age.months, ["месяц", "месяца", "месяцев"])}`}
                            </Text>
                          );
                        }
                      })()}
                      {pet.heightCm && <Text style={styles.petDetail}>Рост: {pet.heightCm} см</Text>}
                      {pet.weightKg && <Text style={styles.petDetail}>Вес: {pet.weightKg} кг</Text>}
                      {pet.notes && <Text style={styles.petDetail}>Заметки: {pet.notes}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              style={styles.addPetButton}
              onPress={() => router.push("/pets/add" as any)}
            >
              <Text style={styles.addPetButtonText}>Добавить питомца</Text>
            </Pressable>
          </View>

          {/* Кнопка смены пароля */}
          <Pressable style={styles.passwordButton} onPress={() => {
            // TODO: Навигация на смену пароля
          }}>
            <Text style={styles.passwordButtonText}>🔐 Сменить пароль</Text>
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
              onPress={() => {
                // TODO: Открыть URL политики
              }}
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
              onPress={() => {
                // TODO: Открыть email или чат поддержки
              }}
            >
              <Text style={styles.infoIcon}>💬</Text>
              <View style={styles.infoContent}>
                <Text style={styles.infoItemTitle}>Связаться с поддержкой</Text>
              </View>
              <Text style={styles.infoArrow}>→</Text>
            </Pressable>
          </Card>
        </View>
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
  // Обёртка как в веб-версии
  wrapper: {
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
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
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarContainer: {
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "#ECE5D2",
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
    flexDirection: "row",
    gap: SPACING.md,
    padding: SPACING.sm,
    backgroundColor: "#ECE5D2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  petAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
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
