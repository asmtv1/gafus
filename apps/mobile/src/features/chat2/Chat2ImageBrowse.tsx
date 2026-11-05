import type { ReactNode } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

/** Left/right gestures browse already-loaded chat attachments, not messages. */
export function Chat2ImageBrowse({ children, onNavigate, enabled }: {
  children: ReactNode;
  onNavigate: (direction: -1 | 1) => void;
  enabled: boolean;
}) {
  const x = useSharedValue(0);
  const swipe = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-22, 22])
    .failOffsetY([-24, 24])
    .onUpdate(event => { x.value = Math.max(-70, Math.min(70, event.translationX)); })
    .onEnd(event => {
      if (Math.abs(event.translationX) > 75 && Math.abs(event.translationY) < 55)
        runOnJS(onNavigate)(event.translationX < 0 ? 1 : -1);
    })
    .onFinalize(() => { x.value = withSpring(0, { damping: 22 }); });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <GestureDetector gesture={swipe}>
    <Animated.View style={[{ flex: 1, justifyContent: "center" }, style]}>{children}</Animated.View>
  </GestureDetector>;
}
