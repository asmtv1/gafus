import { StyleSheet, View } from "react-native";
import { COLORS } from "@/shared/config";

/**
 * Instagram-style pagination: at most five dots even when a post has ten assets.
 * The window follows the active attachment instead of overflowing narrow screens.
 */
export function carouselDotWindow(count: number, position: number): number[] {
  if (!Number.isInteger(count) || count < 2) return [];
  const active = Math.min(count - 1, Math.max(0, Math.round(position)));
  const visible = Math.min(count, 5);
  const start = Math.max(0, Math.min(active - Math.floor(visible / 2), count - visible));
  return Array.from({ length: visible }, (_, index) => start + index);
}

export function FeedCarouselDots({ count, position }: { count: number; position: number }) {
  const dots = carouselDotWindow(count, position);
  if (!dots.length) return null;
  const active = Math.min(count - 1, Math.max(0, Math.round(position)));
  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Вложение ${active + 1} из ${count}`}
      pointerEvents="none"
    >
      {dots.map((index, visualIndex) => {
        const clipped = index !== active &&
          ((visualIndex === 0 && dots[0] !== 0) ||
           (visualIndex === dots.length - 1 && dots[dots.length - 1] !== count - 1));
        return (
          <View
            key={index}
            style={[
              styles.dot,
              clipped && styles.edgeDot,
              index === active && styles.activeDot,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#B5BAA9" },
  edgeDot: { width: 3.5, height: 3.5, borderRadius: 2 },
  activeDot: { width: 6.5, height: 6.5, borderRadius: 4, backgroundColor: COLORS.primary },
});
