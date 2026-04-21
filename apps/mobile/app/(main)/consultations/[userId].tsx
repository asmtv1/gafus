import { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/constants";
import { ConsultationSlotsCalendar } from "@/features/consultations/components/ConsultationSlotsCalendar";

function one(param: string | string[] | undefined): string {
  return Array.isArray(param) ? (param[0] ?? "") : (param ?? "");
}

/**
 * Свободные слоты и запись у выбранного кинолога (календарь как на web).
 */
export default function ConsultationSlotsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    userId: string | string[];
    displayName?: string | string[];
    slotDurationMin?: string | string[];
  }>();
  const userId = one(params.userId);
  const displayName = one(params.displayName);
  const slotDurationMin = useMemo(() => {
    const raw = one(params.slotDurationMin);
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 45;
  }, [params.slotDurationMin]);

  if (!userId) {
    return (
      <SafeAreaView style={styles.root} edges={["bottom"]}>
        <Text style={styles.error}>Не указан кинолог.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <Pressable
        style={styles.linkRow}
        onPress={() => router.push("/consultations" as Href)}
      >
        <Text style={styles.linkText}>← Все кинологи</Text>
      </Pressable>
      <ConsultationSlotsCalendar
        cynologistUserId={userId}
        slotDurationMin={slotDurationMin}
        displayName={displayName || undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  linkRow: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs, marginBottom: SPACING.xs },
  linkText: { fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.primary },
  error: { color: COLORS.error, padding: SPACING.md, fontFamily: FONTS.montserrat },
});
