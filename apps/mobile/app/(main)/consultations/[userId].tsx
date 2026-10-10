import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { ConsultationSlotsCalendar } from "@/features/consultations";

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
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <Text style={styles.error}>Не указан кинолог.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerBackVisible: false }} />
      <AppBackButton style={styles.backRow} onPress={() => router.back()} />
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
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  backRowText: {
    marginLeft: 2,
    color: COLORS.primary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 18,
  },
  error: { color: COLORS.error, padding: SPACING.md, fontFamily: FONTS.montserrat },
});