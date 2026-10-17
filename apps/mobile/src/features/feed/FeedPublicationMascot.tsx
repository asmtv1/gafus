import { View, StyleSheet } from "react-native";
import { LoadingMascot } from "@/shared/components/ui/LoadingMascot";

/** A compact version of the shared animated dog for publication queue cards. */
export function FeedPublicationMascot() {
  return (
    <View
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel="Обрабатываем публикацию"
    >
      <LoadingMascot size={76} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center" },
});
