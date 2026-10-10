import { useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { FEED_REPORT_REASONS, type FeedPostDto, type FeedReportReason } from "@gafus/types";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { feedApi } from "@/shared/lib/api/feed";

function Sheet({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <Modal transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Закрыть" onPress={close} />
      <View style={styles.sheet} accessibilityViewIsModal><ScrollView keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>{children}
        <Pressable accessibilityRole="button" style={styles.row} onPress={close}><Text style={styles.label}>Закрыть</Text></Pressable>
      </ScrollView></View>
    </KeyboardAvoidingView>
  </Modal>;
}
export function FeedReportButton({ type, id, authorId }: { type: "post" | "comment"; id: string; authorId: string }) {
  const [open, setOpen] = useState(false);
  const userId = useAuthStore(state => state.user?.id);
  if (userId === authorId) return null;
  return <><Pressable accessibilityRole="button" style={styles.row} onPress={() => setOpen(true)}><Text style={styles.label}>Пожаловаться</Text></Pressable>
    {open && <FeedReportSheet type={type} id={id} close={() => setOpen(false)} />}</>;
}
function FeedReportSheet({ type, id, close }: { type: "post" | "comment"; id: string; close: () => void }) {
  const [reason, setReason] = useState<FeedReportReason>("spam");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Sheet title="Пожаловаться" close={() => { if (!busy) close(); }}>
    {Object.entries(FEED_REPORT_REASONS).map(([key, label]) => <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: reason === key }} style={styles.row} onPress={() => setReason(key as FeedReportReason)}>
      <MaterialCommunityIcons name={reason === key ? "radiobox-marked" : "radiobox-blank"} size={22} color={COLORS.primary} /><Text style={styles.label}>{label}</Text>
    </Pressable>)}
    <TextInput accessibilityLabel="Комментарий к жалобе" placeholder="Комментарий (необязательно)" placeholderTextColor={COLORS.textSecondary} style={styles.input} multiline maxLength={1000} value={comment} onChangeText={setComment} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} style={styles.row} onPress={async () => {
      setBusy(true); setError("");
      try { await feedApi.report(type, id, { reason, comment }); close(); Alert.alert("Жалоба отправлена", "Мы рассмотрим её. Спасибо."); }
      catch (err) { setError(err instanceof Error ? err.message : "Не удалось отправить жалобу."); }
      finally { setBusy(false); }
    }}><Text style={styles.label}>{busy ? "Отправляем…" : "Отправить жалобу"}</Text></Pressable>
  </Sheet>;
}
export function FeedPostActions({ post, onEdit, onDelete }: { post: FeedPostDto; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  async function run(action: () => Promise<unknown>, message: string, hidden = false) {
    if (busy) return;
    setBusy(true);
    try {
      await action(); setOpen(false); await cache.invalidateQueries({ queryKey: ["feed"] });
      Alert.alert("Лента", message, hidden ? [{ text: "Готово" }, { text: "Отменить", onPress: () => void run(() => feedApi.setAuthorPreference(post.author.id, { hidden: false }), "Автор возвращён в ленту") }] : undefined);
    } catch (err) { Alert.alert("Лента", err instanceof Error ? err.message : "Не удалось выполнить действие."); }
    finally { setBusy(false); }
  }
  const row = (label: string, action: () => void) => <Pressable accessibilityRole="button" disabled={busy} style={styles.row} onPress={action}><Text style={styles.label}>{label}</Text></Pressable>;
  return <><Pressable accessibilityRole="button" accessibilityLabel="Действия с публикацией" style={styles.menu} onPress={() => setOpen(true)}><MaterialCommunityIcons name="dots-horizontal" size={24} color={COLORS.primary} /></Pressable>
    {open && <Sheet title="Публикация" close={() => { if (!busy) setOpen(false); }}>
      {row(post.bookmarked ? "Убрать из закладок" : "Сохранить в закладках", () => void run(() => feedApi.setBookmark(post.id, !post.bookmarked), post.bookmarked ? "Публикация убрана из закладок" : "Публикация сохранена"))}
      {!post.canDelete && row(post.authorNotify ? "Не уведомлять о постах" : "Уведомлять о постах", () => void run(() => feedApi.setAuthorPreference(post.author.id, { notify: !post.authorNotify }), post.authorNotify ? "Уведомления отключены" : "Подписка включена. Разрешите push в настройках уведомлений, чтобы получать новые посты."))}
      {row("Скопировать ссылку", () => void run(() => Clipboard.setStringAsync(`https://gafus.ru/feed/${encodeURIComponent(post.id)}`), "Ссылка скопирована"))}
      {!post.canDelete && row("Не интересно", () => void run(() => feedApi.setAuthorPreference(post.author.id, { hidden: true }), "Все публикации автора скрыты из вашей ленты", true))}
      {!post.canDelete && row("Пожаловаться", () => { setOpen(false); setReport(true); })}
      {post.canEdit && row("Редактировать", () => { setOpen(false); onEdit(); })}
      {post.canDelete && row("Удалить", () => { setOpen(false); onDelete(); })}
    </Sheet>}
    {report && <FeedReportSheet type="post" id={post.id} close={() => setReport(false)} />}
  </>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.4)" },
  sheet: { backgroundColor: COLORS.cardBackground, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32, maxHeight: "85%" },
  title: { fontFamily: FONTS.montserratMedium, fontSize: 20, color: COLORS.text, marginBottom: 12 },
  row: { minHeight: 48, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontFamily: FONTS.montserrat, fontSize: 15, color: COLORS.primary, flexShrink: 1 },
  menu: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: 8, minHeight: 88, padding: 12, color: COLORS.text, fontFamily: FONTS.montserrat },
  error: { color: COLORS.error, paddingVertical: 8 },
});
