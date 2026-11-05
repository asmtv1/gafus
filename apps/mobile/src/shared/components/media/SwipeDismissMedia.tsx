import type { ReactNode } from "react";
import { shouldDismissMediaSwipe } from "./swipeDismissPolicy";
import { useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export function SwipeDismissMedia({ children, onDismiss, enabled = true, style }: {
  children: ReactNode;
  onDismiss: () => void;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { height } = useWindowDimensions();
  const dragY = useSharedValue(0);
  const gesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetY([-22, 22])
    .failOffsetX([-24, 24])
    .onUpdate(event => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd(event => {
      if (shouldDismissMediaSwipe(event.translationY, event.velocityY)) {
        dragY.value = withTiming(height, { duration: 170 }, finished => {
          if (finished) runOnJS(onDismiss)();
        });
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 240 });
      }
    })
    .onFinalize((_event, success) => {
      if (!success) dragY.value = withSpring(0, { damping: 20, stiffness: 240 });
    });
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dragY.value },
      { scale: Math.max(0.92, 1 - dragY.value / 1600) },
    ],
  }));
  return <GestureDetector gesture={gesture}>
    <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>{children}</Animated.View>
  </GestureDetector>;
}
