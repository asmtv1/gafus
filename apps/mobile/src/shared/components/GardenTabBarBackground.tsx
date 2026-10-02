import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

interface GardenTabBarBackgroundProps {
  imageHeight: number;
}

/** Исходная иллюстрация: шесть камней соответствуют шести пунктам меню. */
export function GardenTabBarBackground({ imageHeight }: GardenTabBarBackgroundProps) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Image
        source={require("../../../assets/images/garden-stone-menu-v2.png")}
        contentFit="fill"
        accessible={false}
        style={[styles.image, { height: imageHeight }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
