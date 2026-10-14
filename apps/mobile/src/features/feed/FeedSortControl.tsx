import { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { FeedSort } from "@gafus/types";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from "@/shared/config";
import { Button } from "@/shared/components/ui";

const options = [
  { key: "smart", label: "Для вас" },
  { key: "new", label: "Сначала новые" },
  { key: "popular", label: "Сначала популярные" },
  { key: "discussed", label: "Сначала резонансные" },
] as const;

export function FeedSortControl({ value, onChange, compact = false, smartEnabled = false, onSettings }: { value: FeedSort; onChange: (sort: FeedSort) => void; compact?: boolean; smartEnabled?: boolean; onSettings?: () => void }) {
  const [open, setOpen] = useState(false);
  const visibleOptions = options.filter(option => option.key !== "smart" || smartEnabled);
  const selected = visibleOptions.find(option => option.key === value) ?? visibleOptions[0]!;

  return <>
    <View style={styles.sortButton}>
      <Button
        label=" "
        variant="primary"
        accessibilityLabel={`Сортировка: ${selected.label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        fullWidth
        height={44}
        horizontalPadding={0}
        verticalPadding={0}
        borderRadius={14}
        style={styles.sortButtonBackground}
        animatedPress
      />
      <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
        style={[styles.sortButtonContent, compact && styles.sortButtonContentCompact]}>
        <MaterialCommunityIcons name="swap-vertical" size={compact ? 17 : 20} color="#F6F0DF" />
        <Text style={[styles.sortButtonText, compact && styles.sortButtonTextCompact]} numberOfLines={1}>
          Сортировка
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={compact ? 14 : 18} color="#F6F0DF" />
      </View>
    </View>
    <Modal visible={open} transparent animationType="fade"
      onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.sortOverlay} onPress={() => setOpen(false)}
        accessibilityLabel="Закрыть сортировку">
        <View style={styles.sortMenu} accessibilityViewIsModal accessibilityLabel="Порядок публикаций">
          {visibleOptions.map(option => (
            <Pressable key={option.key} accessibilityRole="radio"
              accessibilityState={{ checked: value === option.key }}
              style={[styles.sortOption, value === option.key && styles.sortOptionActive]}
              onPress={() => { setOpen(false); onChange(option.key); }}>
              <Text style={[styles.sortOptionText, value === option.key && styles.sortOptionTextActive]}>
                {option.label}
              </Text>
              {value === option.key && <Text style={styles.sortCheck}>✓</Text>}
            </Pressable>
          ))}
          {smartEnabled && onSettings && <Pressable accessibilityRole="button"
            onPress={() => { setOpen(false); onSettings(); }} style={styles.sortOption}>
            <Text style={styles.sortOptionText}>Настроить ленту</Text>
            <MaterialCommunityIcons name="cog-outline" size={19} color={COLORS.primary} />
          </Pressable>}
        </View>
      </Pressable>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  sortButton: { flex: 1, minWidth: 0, height: 44, position: "relative" },
  sortButtonBackground: { width: "100%", height: 44 },
  sortButtonContent: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  sortButtonContentCompact: { paddingHorizontal: 7, gap: 3 },
  sortButtonText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#F6F0DF",
    fontFamily: FONTS.montserratBold,
  },
  sortButtonTextCompact: { fontSize: 11 },
  sortOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  sortMenu: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    minWidth: 260,
    maxWidth: "100%",
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  sortOptionActive: { backgroundColor: COLORS.cardBackground },
  sortOptionText: { flex: 1, fontSize: 14, fontWeight: "500", color: COLORS.text },
  sortOptionTextActive: { fontWeight: "600", color: COLORS.primary },
  sortCheck: { fontSize: 16, color: COLORS.primary, fontWeight: "700" },
});
