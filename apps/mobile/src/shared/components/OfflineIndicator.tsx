import { StyleSheet } from "react-native";
import { Text, Surface } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import { COLORS, SPACING } from "@/constants";

/**
 * Индикатор отсутствия сети
 * Показывается вверху экрана когда нет подключения
 */
export function OfflineIndicator() {
  const { isOffline } = useNetworkStatus();

  if (!isOffline) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
    >
      <Surface style={styles.banner} elevation={2}>
        <MaterialCommunityIcons name="wifi-off" size={18} color="#fff" />
        <Text style={styles.text}>Нет подключения к интернету</Text>
      </Surface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.error,
  },
  text: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
});
