import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet } from "react-native";

export function AnimatedTabBarButton({
  children,
  style,
  ref: _ref,
  ...props
}: BottomTabBarButtonProps) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [style, styles.button, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "transparent",
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});
