import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

/**
* Единая бумажная фактура для выразительных экранов приложения.
 * Базовый кремовый цвет остаётся под изображением, поэтому текст и карточки
 * не зависят от яркости или деталей текстуры.
 */
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
        source={require("../../../assets/images/paper-texture.jpg")}
        contentFit="fill"
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
    opacity: 0.4,
  },
});
