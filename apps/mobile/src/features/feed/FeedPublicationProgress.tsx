import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getFeedPublicationPercent } from "./publicationProgressState";

const SEGMENT_FRACTION = 0.38;
const ANIMATION_MS = 1700;
const GRADIENT = ["#91A36B", "#71804B", "#4B5C30"] as const;

type Props = {
  phase: "uploading" | "processing";
  /** Actual acknowledged upload percentage; processing has no percentage. */
  progress?: number | null;
};

/** Real upload progress, then an indeterminate animation while the server processes the post. */
export function FeedPublicationProgress({ phase, progress }: Props) {
  const percent = getFeedPublicationPercent(phase, progress);
  const indeterminate = percent === null;
  const [trackWidth, setTrackWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const movement = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active) setReduceMotion(enabled);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!indeterminate || reduceMotion || trackWidth === 0) {
      movement.stopAnimation();
      return;
    }
    movement.setValue(0);
    const animation = Animated.loop(Animated.timing(movement, {
      toValue: 1,
      duration: ANIMATION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [indeterminate, movement, reduceMotion, trackWidth]);

  const segmentWidth = trackWidth * SEGMENT_FRACTION;
  const translateX = reduceMotion
    ? (trackWidth - segmentWidth) / 2
    : movement.interpolate({ inputRange: [0, 1], outputRange: [-segmentWidth, trackWidth] });

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={phase === "processing" ? "Обработка публикации" : "Загрузка публикации"}
      accessibilityValue={percent === null ? undefined : { min: 0, max: 100, now: percent }}
      onLayout={event => {
        const width = event.nativeEvent.layout.width;
        setTrackWidth(current => Math.abs(current - width) > 1 ? width : current);
      }}
    >
      {indeterminate ? (
        trackWidth > 0 && (
          <Animated.View style={[styles.fill, { width: segmentWidth, transform: [{ translateX }] }]}
            accessible={false}>
            <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill} />
          </Animated.View>
        )
      ) : (
        <View style={[styles.fill, { width: `${percent}%` }]} accessible={false}>
          <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: "100%", height: 7, borderRadius: 999, overflow: "hidden", backgroundColor: "#E1E5D4" },
  fill: { height: "100%", borderRadius: 999, overflow: "hidden" },
});
