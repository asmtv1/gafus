import { Image, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";

/**
 * Static splash is bundled with the native app and the JS bundle.
 * No GIF decoding, network prefetch, timers or asset downloads on the startup path.
 * Use contain so portrait splash art is never cropped on tall Android screens.
 */
export function StartupLoader({ onReady }: { onReady?: () => void }) {
  return (
    <View style={styles.container} testID="startup-splash">
      <Image
        source={require("../../../assets/images/startup-splash.png")}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        onLoadEnd={onReady}
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
