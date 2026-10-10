import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";
import { COLORS, FONTS } from "@/shared/config";

type AppBackButtonProps = {
  onPress: () => void;
};

/** Shared back control for screens that require an explicit navigation target. */
export function AppBackButton({ onPress }: AppBackButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Назад"
      onPress={onPress}
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
      <Text style={styles.label}>Назад</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingRight: 8,
  },
  pressed: { opacity: 0.7 },
  label: {
    fontFamily: FONTS.montserrat,
    fontWeight: "500",
    fontSize: 17,
    color: COLORS.primary,
  },
});
