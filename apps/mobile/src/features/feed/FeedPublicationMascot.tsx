import { View, StyleSheet } from "react-native";
import { LoadingMascot } from "@/shared/components/ui/LoadingMascot";

/** Shared animated loading mascot for publication queue cards. */
export function FeedPublicationMascot() {
  return (
    <View
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel="Обрабатываем публикацию"
    >
      <LoadingMascot />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center" },
});
