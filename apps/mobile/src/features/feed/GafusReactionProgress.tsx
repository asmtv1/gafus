import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { gafusApi } from "@/shared/lib/api/gafus";
import { COLORS } from "@/shared/config";

export function GafusReactionProgress({ postId }: { postId: string }) {
  const query = useQuery({
    queryKey: ["gafus", "reaction-progress", postId],
    queryFn: () => gafusApi.reactionProgress(postId),
    staleTime: 20_000,
    retry: false,
  });
  const progress = query.data;
  if (!progress) return null;
  const left = Math.max(0, progress.nextThreshold - progress.current);
  return <View style={styles.card} accessibilityLabel="Прогресс награды за реакции">
    <Text style={styles.title}>🐾 Гафусы за реакции</Text>
    <Text style={styles.detail}>
      {progress.current} реакций · до следующей награды ещё {left}
    </Text>
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(progress.progress * 100)}%` }]} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFAF0", borderRadius: 14, borderWidth: 1,
    borderColor: "#E3DBBA", padding: 14, marginVertical: 8,
  },
  title: { fontWeight: "700", fontSize: 14, color: COLORS.primary },
  detail: { color: "#66735A", fontSize: 13, marginVertical: 7 },
  track: { width: "100%", height: 6, borderRadius: 5, backgroundColor: "#E3EAD7" },
  fill: { height: "100%", backgroundColor: "#7B914C", borderRadius: 5 },
});
