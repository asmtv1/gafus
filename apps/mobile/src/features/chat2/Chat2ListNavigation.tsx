import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type NavigationItemProps = {
  icon: IconName;
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
  last?: boolean;
};

function NavigationItem({
  icon, title, description, onPress, disabled = false, last = false,
}: NavigationItemProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.item, !last && styles.itemDivider, disabled && styles.disabled]}
    >
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name={icon} size={22} color="#576b40" />
      </View>
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={23} color="#8c987f" />
    </TouchableOpacity>
  );
}

/** Discovery and chat actions are navigation, never conversation previews. */
export function Chat2ListNavigation({
  onDiscover, onCynologist, onCourses, onModeration, loading,
}: {
  onDiscover: () => void;
  onCynologist: () => void;
  onCourses: () => void;
  onModeration?: () => void;
  loading: boolean;
}) {
  return (
    <View style={styles.section} accessibilityLabel="Другие разделы чатов">
      <View style={styles.header}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Другие разделы</Text>
        <Text style={styles.sectionHint}>Сообщества и тематические чаты</Text>
      </View>
      <View style={styles.panel}>
        <NavigationItem
          icon="account-group-outline"
          title="Найти сообщества"
          description="Поиск групп по интересам"
          onPress={onDiscover}
        />
        <NavigationItem
          icon="dog"
          title="Чат с кинологом"
          description="Общение со специалистом"
          onPress={onCynologist}
          disabled={loading}
        />
        <NavigationItem
          icon="school-outline"
          title="Чаты доступных курсов"
          description="Обсуждения ваших курсов"
          onPress={onCourses}
          disabled={loading}
          last
        />
      </View>
      {onModeration && (
        <View style={styles.staffPanel}>
          <NavigationItem
            icon="shield-account-outline"
            title="Модерация жалоб"
            description="Инструменты команды GAFUS"
            onPress={onModeration}
            last
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 22,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#d9e1d5",
    gap: 12,
  },
  header: { paddingHorizontal: 4, gap: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#3e4a32" },
  sectionHint: { fontSize: 12, color: "#758272" },
  panel: {
    borderRadius: 20,
    backgroundColor: "#edf1e7",
    borderWidth: 1,
    borderColor: "#d9e1d2",
    overflow: "hidden",
    paddingHorizontal: 13,
  },
  staffPanel: {
    borderRadius: 17,
    backgroundColor: "#f1f1e8",
    borderWidth: 1,
    borderColor: "#deded3",
    overflow: "hidden",
    paddingHorizontal: 13,
    marginTop: 4,
  },
  item: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 3,
  },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: "#d8e0d0" },
  disabled: { opacity: 0.55 },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#dfe8d6",
    alignItems: "center",
    justifyContent: "center",
  },
  itemBody: { flex: 1, gap: 4, minWidth: 0 },
  itemTitle: { fontSize: 14, fontWeight: "700", color: "#485c37" },
  itemDescription: { fontSize: 12, color: "#758272", lineHeight: 17 },
});
