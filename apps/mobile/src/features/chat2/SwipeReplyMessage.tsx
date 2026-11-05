import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { shouldReplyToSwipe } from "@/shared/components/gestures/swipePolicy";

/** A right swipe follows the finger, then returns with spring and quotes the message. */
export function SwipeReplyMessage({ children, onReply, enabled = true }: {
  children: ReactNode;
  onReply: () => void;
  enabled?: boolean;
}) {
  const translation = useSharedValue(0);
  const reply = () => { void hapticFeedback.selection(); onReply(); };
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(24)
    .failOffsetY([-24, 24])
    .onUpdate(event => {
      translation.value = Math.min(78, Math.max(0, event.translationX));
    })
    .onEnd(event => {
      if (shouldReplyToSwipe(event.translationX, event.translationY, event.velocityX))
        runOnJS(reply)();
    })
    .onFinalize(() => { translation.value = withSpring(0, { damping: 19, stiffness: 245 }); });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: translation.value }] }));
  const arrowStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, translation.value / 60) }));
  return <GestureDetector gesture={pan}>
    <View style={styles.row}>
      <Animated.View style={[styles.replyArrow, arrowStyle]} pointerEvents="none">
        <MaterialCommunityIcons name="reply" size={23} color="#566d46" />
      </Animated.View>
      <Animated.View style={style}>{children}</Animated.View>
    </View>
  </GestureDetector>;
}
const styles = StyleSheet.create({
  row: { position: "relative" },
  replyArrow: { position: "absolute", left: 20, top: "50%", marginTop: -12 },
});
