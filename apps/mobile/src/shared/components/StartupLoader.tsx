import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";

/**
 * The same bundled portrait poster covers the Android/iOS transition from
 * native splash to the first React screen. Never rely on absoluteFill Image
 * sizing: Android can paint the unscaled 1080x1920 bitmap in a tab navigator.
 */
export function StartupLoader({
  onReady,
  overlay = false,
}: {
  onReady?: () => void;
  overlay?: boolean;
}) {
  const [laidOut, setLaidOut] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // A successful bitmap load isn't enough: wait for a layout pass before
  // allowing native splash to disappear, otherwise a blank frame may flash.
  useEffect(() => {
    if (laidOut && imageLoaded) onReady?.();
  }, [laidOut, imageLoaded, onReady]);

  return (
    <View
      style={[styles.container, overlay ? styles.overlay : styles.fullScreen]}
      onLayout={() => setLaidOut(true)}
      testID="startup-splash"
    >
      <Image
        source={require("../../../assets/images/startup-splash.png")}
        style={styles.poster}
        resizeMode="contain"
        onLoad={() => setImageLoaded(true)}
        // A bundled asset failure must not trap the user on the native splash.
        onError={() => setImageLoaded(true)}
        accessibilityLabel="Всё у тебя получится!"
      />
      <StatusBar style="dark" backgroundColor="#B5E5EB" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#B5E5EB",
    overflow: "hidden",
  },
  fullScreen: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  poster: {
    width: "100%",
    height: "100%",
  },
});
