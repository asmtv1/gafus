import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";

/** Only used during application bootstrap, never for screen or request loading. */
export function StartupLoader({ onReady }: { onReady?: () => void }) {
  return (
    <View style={styles.container}>
      <Image
        source={require("../../../assets/images/startup-loader.gif")}
        placeholder={require("../../../assets/images/startup-splash.png")}
        placeholderContentFit="cover"
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        autoplay
        transition={0}
        onDisplay={onReady}
        onError={onReady}
        accessibilityLabel="Всё у тебя получится!"
      />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#B5E5EB",
    zIndex: 100,
  },
});
