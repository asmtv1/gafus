import { useEffect, useRef, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { COLORS, FONTS } from "@/shared/config";

export type AppBackButtonProps = {
  onPress: () => void;
  label?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

/** GAFUS back button: olive icon circle, cream pill, spring press animation. */
export function AppBackButton({
  onPress,
  label = "Назад",
  style,
  disabled = false,
}: AppBackButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => { if (active) setReduceMotion(value); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
      scale.stopAnimation();
    };
  }, [scale]);

  const animatePress = (pressed: boolean) => {
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: pressed ? 0.94 : 1,
      speed: pressed ? 36 : 22,
      bounciness: pressed ? 0 : 6,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.container, style, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => animatePress(true)}
        onPressOut={() => animatePress(false)}
        style={({ pressed }) => [
          styles.root,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="chevron-left" size={24} color="#FFF8E5" />
        </View>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
  },
  root: {
    height: 44,
    minWidth: 119,
    paddingLeft: 4,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 24,
    backgroundColor: "#FFF8EB",
    borderWidth: 1,
    borderColor: "#D8B98E",
    shadowColor: "#5B482F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  pressed: { backgroundColor: "#F1E8D7", opacity: 0.96 },
  disabled: { opacity: 0.55 },
  iconCircle: {
    width: 35,
    height: 35,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  label: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: "center",
    includeFontPadding: false,
    color: COLORS.primaryDark,
  },
});
