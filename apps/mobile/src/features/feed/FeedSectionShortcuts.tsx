import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS, FONTS } from "@/shared/config";

type FeedShortcut = "saved" | "hidden";

/** Компактная навигация по личным разделам «Моментов» вместо текстовых ссылок. */
export function FeedSectionShortcuts({ active }: { active?: FeedShortcut }) {
  const router = useRouter();

  return (
    <View style={styles.wrapper}>
      <View style={styles.group}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закладки"
          accessibilityHint="Открыть сохранённые публикации"
          accessibilityState={{ selected: active === "saved" }}
          onPress={() => {
            if (active !== "saved") router.push("/(main)/feed/saved" as Href);
          }}
          style={({ pressed }) => [
            styles.item,
            styles.savedItem,
            active === "saved" && styles.itemActive,
            pressed && styles.itemPressed,
          ]}
        >
          <MaterialCommunityIcons
            name={active === "saved" ? "bookmark" : "bookmark-outline"}
            size={19}
            color={COLORS.primary}
          />
          <Text style={styles.label} numberOfLines={1}>Закладки</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Скрытые авторы"
          accessibilityHint="Управление авторами, скрытыми из «Моментов»"
          accessibilityState={{ selected: active === "hidden" }}
          onPress={() => {
            if (active !== "hidden") router.push("/(main)/feed/hidden-authors" as Href);
          }}
          style={({ pressed }) => [
            styles.item,
            styles.hiddenItem,
            active === "hidden" && styles.itemActive,
            pressed && styles.itemPressed,
          ]}
        >
          <MaterialCommunityIcons
            name="account-off-outline"
            size={19}
            color={COLORS.primary}
          />
          <Text style={styles.label} numberOfLines={1}>Скрытые авторы</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  group: {
    flexDirection: "row",
    alignSelf: "flex-start",
    maxWidth: "100%",
    minHeight: 44,
    padding: 3,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.borderLight,
    backgroundColor: "rgba(250, 247, 239, 0.95)",
    shadowColor: "#352E2E",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  item: {
    minWidth: 0,
    minHeight: 38,
    paddingHorizontal: 11,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  savedItem: { flexShrink: 1 },
  hiddenItem: { flexShrink: 1 },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 21,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 1,
  },
  itemActive: { backgroundColor: "#DEE7D0" },
  itemPressed: { backgroundColor: "#E5EBD9" },
  label: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.primary,
  },
});
