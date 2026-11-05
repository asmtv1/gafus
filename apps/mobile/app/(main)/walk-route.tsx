import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native-paper";
import { TexturedSafeAreaView } from "@/shared/components";
import { reportClientError } from "@/shared/lib/tracer";
import { COLORS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores/authStore";
import { loadWalkJournal, saveWalkJournal, type WalkJournal } from "@/features/walk/walkStorage";
import { WalkRouteMap } from "@/features/walk/WalkRouteMap";
import { markGpsWalkDeleted } from "@/features/walk/walkGpsStorage";
import { syncDogWalkHistory, reportWalkSyncIssue } from "@/features/walk/walkSync";
import {
  formatWalkDistance,
  formatWalkDuration,
  walkDistanceMeters,
  walkDurationSeconds,
} from "@/features/walk/walkModel";

export default function WalkRouteScreen() {
  const router = useRouter();
  const { walkId } = useLocalSearchParams<{ walkId?: string }>();
  const ownerId = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading && s.verifiedSessionEpoch ? (s.user?.id ?? null) : null,
  );
  const [journal, setJournal] = useState<WalkJournal | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    let valid = true;
    setJournal(null);
    if (ownerId)
      void loadWalkJournal(ownerId)
        .then((j) => {
          if (valid) setJournal(j);
        })
        .catch((error: unknown) => reportClientError(error, { issueKey: "DogWalkRouteHistory" }));
    return () => {
      valid = false;
    };
  }, [ownerId]);
  const walk = journal?.completed.find((w) => w.clientId === walkId);
  const deleteWalk = () => {
    if (!ownerId || !walkId || deleting || !walk) return;
    Alert.alert(
      "Удалить прогулку?",
      "Запись и GPS-маршрут будут удалены с телефона и с сервера при следующей синхронизации. Отменить это действие нельзя.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => {
            setDeleting(true);
            void (async () => {
              // Tombstone FIRST: interrupted deletes must not resurrect private tracks.
              await markGpsWalkDeleted(ownerId, walkId, true);
              const latest = await loadWalkJournal(ownerId);
              await saveWalkJournal(ownerId, {
                ...latest,
                completed: latest.completed.filter((w) => w.clientId !== walkId),
              });
              void syncDogWalkHistory(ownerId).catch(reportWalkSyncIssue);
              router.back();
            })().catch(() => {
              setDeleting(false);
              Alert.alert(
                "Не удалось удалить",
                "Данные на телефоне не изменены полностью. Повторите действие.",
              );
            });
          },
        },
      ],
    );
  };
  if (!ownerId || !walkId || !/^[0-9a-f-]{36}$/i.test(walkId))
    return (
      <TexturedSafeAreaView style={styles.page}>
        <Text style={styles.title}>Маршрут недоступен</Text>
      </TexturedSafeAreaView>
    );
  return (
    <TexturedSafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button">
          <MaterialCommunityIcons name="chevron-left" size={26} color={COLORS.primary} />
          <Text style={styles.heading}>Маршрут прогулки</Text>
        </Pressable>
        {walk ? (
          <View style={styles.stats}>
            <Text>
              {new Date(walk.startedAtMs).toLocaleString("ru-RU", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </Text>
            <Text style={styles.title}>
              {formatWalkDistance(walkDistanceMeters(walk))} · {walk.steps.toLocaleString("ru-RU")}{" "}
              шагов
            </Text>
            <Text>
              {formatWalkDuration(walkDurationSeconds(walk, walk.finishedAtMs ?? Date.now()))}
            </Text>
          </View>
        ) : null}
        <WalkRouteMap ownerId={ownerId} walkId={walkId} live={false} />
        {walk ? (
          <Pressable
            onPress={deleteWalk}
            disabled={deleting}
            style={styles.deleteButton}
            accessibilityRole="button"
            accessibilityLabel="Удалить прогулку и GPS-маршрут"
          >
            <MaterialCommunityIcons name="delete-outline" size={22} color="#AE342F" />
            <Text style={styles.deleteText}>{deleting ? "Удаляем…" : "Удалить прогулку"}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </TexturedSafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, gap: 18 },
  back: { flexDirection: "row", alignItems: "center", gap: 8 },
  heading: { fontSize: 22, fontWeight: "700", color: COLORS.text },
  title: { fontSize: 19, fontWeight: "700", color: COLORS.text },
  stats: { padding: 16, backgroundColor: "#F8F4EA", borderRadius: 18, gap: 8 },
  deleteButton: {
    backgroundColor: "#FFF3EF",
    padding: 16,
    borderWidth: 1,
    borderColor: "#E7C7C1",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  deleteText: { fontWeight: "700", color: "#AE342F" },
});
