import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

/** Общий фон экранов мобильного приложения. */
export function PaperTextureBackground() {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.layer}
    >
      <Image
        source={require("../../../assets/images/sky-background.png")}
        contentFit="cover"
        blurRadius={8}
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
    opacity: 0.27,
  },
});
