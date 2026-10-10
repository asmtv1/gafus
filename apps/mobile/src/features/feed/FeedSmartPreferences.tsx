import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeedPersonalizationSettings } from "@gafus/types";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { feedApi } from "@/shared/lib/api/feed";
import { Loading } from "@/shared/components";

const options: { key: keyof FeedPersonalizationSettings; label: string; hint: string }[] = [
  { key: "enabled", label: "Персональные рекомендации", hint: "Использовать умную сортировку «Для вас»" },
  { key: "useCity", label: "Мой город", hint: "Чаще показывать людей из вашего города" },
  { key: "usePets", label: "Мои питомцы", hint: "Учитывать вид и породу питомцев" },
  { key: "useBehavior", label: "Моя активность", hint: "Учитывать реакции, комментарии и просмотры" },
  { key: "exploration", label: "Новые авторы", hint: "Иногда показывать незнакомые публикации" },
];

export function FeedSmartPreferences({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const userId = useAuthStore(state => state.user?.id);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const settings = useQuery({
    queryKey: ["feed", "personalization", userId],
    queryFn: () => feedApi.getPersonalization(),
    enabled: visible && !!userId,
  });
  async function change(key: keyof FeedPersonalizationSettings, value: boolean) {
    setBusy(true);
    setError("");
    try {
      await feedApi.setPersonalization({ [key]: value });
      queryClient.removeQueries({ queryKey: ["feed", "posts", userId, "smart"] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["feed", "personalization", userId] }),
        queryClient.invalidateQueries({ queryKey: ["feed", "posts", userId] }),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось изменить настройку");
    } finally { setBusy(false); }
  }
  function reset() {
    Alert.alert("Сбросить рекомендации?", "Рекомендации начнут подстраиваться заново. Реакции, комментарии и закладки сохранятся.", [
      { text: "Отмена", style: "cancel" },
      { text: "Сбросить", style: "destructive", onPress: () => {
        setBusy(true);
        void feedApi.resetPersonalization().then(() => {
          queryClient.removeQueries({ queryKey: ["feed", "posts", userId, "smart"] });
          return queryClient.invalidateQueries({ queryKey: ["feed", "posts", userId] });
        }).catch(caught => setError(caught instanceof Error ? caught.message : "Не удалось сбросить рекомендации"))
          .finally(() => setBusy(false));
      } },
    ]);
  }
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Закрыть настройки"
        style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.panel} accessibilityViewIsModal>
        <View style={styles.head}>
          <Text style={styles.title}>Настроить ленту</Text>
          <Pressable accessibilityRole="button" onPress={onClose}>
            <Text style={styles.close}>Закрыть</Text>
          </Pressable>
        </View>
        {settings.isPending ? <Loading variant="inline" /> :
          settings.isError ? <Text style={styles.error}>Не удалось загрузить настройки</Text> :
          options.map(option => {
            const disabled = busy || (option.key !== "enabled" && settings.data?.enabled === false);
            return <View key={option.key} style={styles.row}>
              <View style={styles.textColumn}>
                <Text style={styles.label}>{option.label}</Text>
                <Text style={styles.hint}>{option.hint}</Text>
              </View>
              <Switch accessibilityLabel={option.label} value={settings.data?.[option.key] ?? true}
                disabled={disabled} onValueChange={value => void change(option.key, value)}
                trackColor={{ true: COLORS.primary }} />
            </View>;
          })}
        <Pressable accessibilityRole="button" disabled={busy} onPress={reset} style={styles.reset}>
          <Text style={styles.resetText}>Сбросить рекомендации</Text>
        </Pressable>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 20 },
  panel: { backgroundColor: COLORS.cardBackground, borderRadius: 18, padding: 18 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 },
  title: { fontSize: 17, fontFamily: FONTS.montserrat, fontWeight: "700", color: COLORS.text },
  close: { fontSize: 13, color: COLORS.primary, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderLight },
  textColumn: { flex: 1 },
  label: { fontSize: 14, color: COLORS.text, fontWeight: "600" },
  hint: { fontSize: 11, color: COLORS.textSecondary, marginTop: 3 },
  error: { color: "#AE382E", marginTop: 10 },
  reset: { paddingVertical: 15, alignItems: "center" },
  resetText: { color: COLORS.primary, fontSize: 13, fontWeight: "600" },
});
