import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, FONTS } from "@/shared/config";

type HeartState = { liked: boolean; hearts: number };

/**
 * Lightweight optimistic reaction: the icon pops immediately on tap and the
 * count changes without waiting for the network. No Pressable pressed background.
 * A failed request restores the previous state.
 */
export function QuestionAnswerHeart({
  liked,
  hearts,
  disabled = false,
  onToggle,
  onSuccess,
  onError,
}: {
  liked: boolean;
  hearts: number;
  disabled?: boolean;
  onToggle: (nextLiked: boolean) => Promise<unknown>;
  onSuccess: () => Promise<unknown>;
  onError: (error: unknown) => void;
}) {
  const [value, setValue] = useState<HeartState>({ liked, hearts });
  const [pending, setPending] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const inFlight = useRef(false);

  useEffect(() => {
    if (!inFlight.current) setValue({ liked, hearts });
  }, [liked, hearts]);

  const animate = (nextLiked: boolean) => {
    scale.stopAnimation();
    scale.setValue(nextLiked ? 0.8 : 1.08);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: nextLiked ? 1.24 : 0.92,
        duration: 135,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 115,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const toggle = async () => {
    if (disabled || inFlight.current) return;
    const previous = value;
    const nextLiked = !previous.liked;
    inFlight.current = true;
    setPending(true);
    setValue({
      liked: nextLiked,
      hearts: Math.max(0, previous.hearts + (nextLiked ? 1 : -1)),
    });
    animate(nextLiked);
    try {
      await onToggle(nextLiked);
      await onSuccess();
    } catch (error) {
      setValue(previous);
      animate(previous.liked);
      onError(error);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value.liked ? "Убрать сердечко" : "Поставить сердечко"}
      accessibilityHint={`Отметок нравится: ${value.hearts}`}
      accessibilityState={{ disabled: disabled || pending, selected: value.liked }}
      disabled={disabled || pending}
      hitSlop={4}
      onPress={() => void toggle()}
      style={styles.button}
    >
      <Animated.View style={{ transform: [{ scale }] }} pointerEvents="none">
        <MaterialCommunityIcons
          name={value.liked ? "heart" : "heart-outline"}
          size={21}
          color={value.liked ? "#F4435D" : COLORS.textSecondary}
        />
      </Animated.View>
      {value.hearts > 0 && <Text style={styles.count}>{value.hearts}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 1,
    width: 40,
    height: 40,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  count: {
    fontFamily: FONTS.montserrat,
    fontSize: 10,
    lineHeight: 13,
    fontVariant: ["tabular-nums"],
    color: COLORS.textSecondary,
  },
});
