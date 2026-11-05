import { View, StyleSheet } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { shouldCloseSheet } from "./swipePolicy";

/** Deliberately activates only on the sheet handle, never on its scrollable content. */
export function SwipeDismissHandle({ close, disabled = false }: {
  close: () => void;
  disabled?: boolean;
}) {
  const y = useSharedValue(0);
  const drag = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetY([-18, 18])
    .failOffsetX([-25, 25])
    .onUpdate(event => { y.value = Math.max(0, Math.min(80, event.translationY)); })
    .onEnd(event => {
      if (shouldCloseSheet(event.translationY, event.velocityY)) runOnJS(close)();
    })
    .onFinalize(() => { y.value = withSpring(0, { damping: 22 }); });
  const movement = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  // React Native Modal / Paper Portal may create another native root on Android.
  return <GestureHandlerRootView style={styles.root}>
    <GestureDetector gesture={drag}>
      <Animated.View style={[styles.touchArea, movement]} accessible
        accessibilityLabel="Свайпните вниз для закрытия">
        <View style={styles.grabber} />
      </Animated.View>
    </GestureDetector>
  </GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  root: { width: 112, height: 32, alignSelf: "center" },
  touchArea: { height: 32, width: 112, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  grabber: { height: 5, width: 42, borderRadius: 3, backgroundColor: "#9da797" },
});
