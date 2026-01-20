import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { Text, Avatar, List, Divider, Switch } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState } from "react";

import { Button, Card } from "@/shared/components/ui";
import { useAuthStore } from "@/shared/stores";
import { COLORS, SPACING } from "@/constants";

/**
 * Страница профиля пользователя
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Информация о пользователе */}
        <View style={styles.profileHeader}>
          <Avatar.Text
            size={80}
            label={getInitials(user?.name || user?.username || "U")}
            style={styles.avatar}
          />
          <Text variant="headlineSmall" style={styles.userName}>
            {user?.name || user?.username || "Пользователь"}
          </Text>
          {user?.email && (
            <Text variant="bodyMedium" style={styles.userEmail}>
              {user.email}
            </Text>
          )}
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {getRoleLabel(user?.role)}
            </Text>
          </View>
        </View>

        {/* Настройки */}
        <Card style={styles.settingsCard}>
          <List.Section>
            <List.Subheader>Настройки</List.Subheader>
            
            <List.Item
              title="Уведомления"
              description="Получать push-уведомления"
              left={(props) => <List.Icon {...props} icon="bell" />}
              right={() => (
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                />
              )}
            />
            
            <Divider />
            
            <List.Item
              title="Редактировать профиль"
              description="Изменить имя и фото"
              left={(props) => <List.Icon {...props} icon="account-edit" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push("/profile/edit")}
            />
            
            <Divider />
            
            <List.Item
              title="Мои питомцы"
              description="Управление профилями питомцев"
              left={(props) => <List.Icon {...props} icon="paw" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push("/pets")}
            />
          </List.Section>
        </Card>

        {/* Информация */}
        <Card style={styles.settingsCard}>
          <List.Section>
            <List.Subheader>Информация</List.Subheader>
            
            <List.Item
              title="О приложении"
              description="Версия 1.0.0"
              left={(props) => <List.Icon {...props} icon="information" />}
            />
            
            <Divider />
            
            <List.Item
              title="Политика конфиденциальности"
              left={(props) => <List.Icon {...props} icon="shield-lock" />}
              right={(props) => <List.Icon {...props} icon="open-in-new" />}
              onPress={() => {
                // TODO: Открыть URL политики
              }}
            />
            
            <Divider />
            
            <List.Item
              title="Связаться с поддержкой"
              left={(props) => <List.Icon {...props} icon="help-circle" />}
              right={(props) => <List.Icon {...props} icon="open-in-new" />}
              onPress={() => {
                // TODO: Открыть email или чат поддержки
              }}
            />
          </List.Section>
        </Card>

        {/* Выход */}
        <Button
          label="Выйти из аккаунта"
          mode="outlined"
          onPress={handleLogout}
          style={styles.logoutButton}
          textColor={COLORS.error}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Получение инициалов из имени
 */
function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Получение читаемого названия роли
 */
function getRoleLabel(role?: string): string {
  switch (role) {
    case "ADMIN":
      return "Администратор";
    case "TRAINER":
      return "Тренер";
    case "USER":
    default:
      return "Пользователь";
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  profileHeader: {
    alignItems: "center",
    paddingVertical: SPACING.xl,
  },
  avatar: {
    backgroundColor: COLORS.primary,
    marginBottom: SPACING.md,
  },
  userName: {
    fontWeight: "bold",
  },
  userEmail: {
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  roleBadge: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.primary + "20",
    borderRadius: 16,
  },
  roleText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  settingsCard: {
    marginBottom: SPACING.md,
  },
  logoutButton: {
    marginTop: SPACING.md,
    borderColor: COLORS.error,
  },
});
