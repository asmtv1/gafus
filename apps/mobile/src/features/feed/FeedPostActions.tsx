import { useRef, useState, type ComponentProps } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const triggerRef = useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  const openMenu = () => {
    if (busy) return;
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };
  const requestReport = () => {
    setOpen(false);
    if (Platform.OS === "ios") setReportPending(true);
    else setReport(true);
  };
  async function run(action: () => Promise<unknown>, message: string, hidden = false) {
    if (busy) return;
    setOpen(false);
    setBusy(true);
    try {
      await action();
      await cache.invalidateQueries({ queryKey: ["feed"] });
      Alert.alert("Моменты", message, hidden
        ? [
          { text: "Готово" },
          { text: "Отменить", onPress: () => void run(
            () => feedApi.setAuthorPreference(post.author.id, { hidden: false }),
            "Публикации автора снова видны в «Моментах»",
          ) },
        ] : undefined);
    } catch (err) { Alert.alert("Моменты", err instanceof Error ? err.message : "Не удалось выполнить действие."); }
    finally { setBusy(false); }
  }
  type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
  const row = (icon: IconName, label: string, action: () => void, destructive = false) =>
    <Pressable key={label} accessibilityRole="button" disabled={busy} onPress={action}
      style={({ pressed }) => [styles.popoverRow, pressed && styles.popoverRowPressed]}>
      <MaterialCommunityIcons name={icon} size={20} color={destructive ? "#A34842" : COLORS.primary} />
      <Text style={[styles.popoverLabel, destructive && styles.popoverDanger]}>{label}</Text>
    </Pressable>;

  const menuWidth = Math.min(266, screenWidth - 24);
  const optionCount = 2 + (!post.canDelete ? 3 : 0) + (post.canEdit ? 1 : 0) + (post.canDelete ? 1 : 0) +
    (post.recommendationReason ? 1 : 0) + (!post.canDelete && post.recommendationReason ? 1 : 0);
  const menuHeight = optionCount * 44 + 14;
  const safeTop = insets.top + 8;
  const maxTop = Math.max(safeTop, screenHeight - insets.bottom - menuHeight - 12);
  const below = anchor ? anchor.y + anchor.height + 5 : safeTop;
  const above = anchor ? anchor.y - menuHeight - 5 : safeTop;
  const top = Math.max(safeTop, Math.min(maxTop, below <= maxTop ? below : above));
  const left = anchor
    ? Math.max(12, Math.min(screenWidth - menuWidth - 12, anchor.x + anchor.width - menuWidth + 4))
    : 12;

  return <>
    <Pressable ref={triggerRef} accessibilityRole="button" accessibilityLabel="Действия с публикацией"
      accessibilityState={{ expanded: open, disabled: busy }} hitSlop={4}
      style={styles.menu} onPress={event => {
        event.stopPropagation();
        openMenu();
      }}>
      <MaterialCommunityIcons name="dots-horizontal" size={24} color={COLORS.primary} />
    </Pressable>
    <Modal visible={open} transparent statusBarTranslucent animationType="fade"
      onRequestClose={() => setOpen(false)}
      onDismiss={() => {
        if (reportPending) {
          setReportPending(false);
          setReport(true);
        }
      }}>
      <View style={styles.popoverOverlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button"
          accessibilityLabel="Закрыть меню публикации" onPress={() => setOpen(false)} />
        <View style={[styles.popover, { top, left, width: menuWidth }]}
          accessibilityViewIsModal accessibilityLabel="Действия с публикацией">
          {row(post.bookmarked ? "bookmark" : "bookmark-outline",
            post.bookmarked ? "Убрать из закладок" : "Сохранить в закладках",
            () => void run(() => feedApi.setBookmark(post.id, !post.bookmarked),
              post.bookmarked ? "Публикация убрана из закладок" : "Публикация сохранена"))}
          {!post.canDelete && row(post.authorNotify ? "bell-off-outline" : "bell-outline",
            post.authorNotify ? "Отключить уведомления" : "Уведомлять о постах",
            () => void run(() => feedApi.setAuthorPreference(post.author.id, { notify: !post.authorNotify }),
              post.authorNotify ? "Уведомления отключены" : "Подписка включена. Разрешите push в настройках уведомлений, чтобы получать новые посты."))}
          {row("link-variant", "Скопировать ссылку",
            () => void run(() => Clipboard.setStringAsync(`https://gafus.ru/feed/${encodeURIComponent(post.id)}`),
              "Ссылка скопирована"))}
          {post.recommendationReason && row("information-outline", "Почему я вижу эту публикацию?", () => {
            setOpen(false);
            const descriptions = {
              same_city: "Автор указал тот же город, что и вы.",
              similar_pet: "У вас похожие питомцы.",
              author_affinity: "Вы часто взаимодействуете с публикациями этого автора.",
              trending: "Эта публикация интересна другим пользователям.",
              discovery: "Знакомим вас с новыми авторами.",
            };
            const reason = post.recommendationReason!;
            Alert.alert("Почему эта публикация?", descriptions[reason]);
          })}
          {!post.canDelete && post.recommendationReason && row("eye-off-outline", "Не интересно",
            () => void run(() => feedApi.setPostFeedback(post.id),
              "Эта публикация больше не будет показываться в рекомендациях"))}
          {!post.canDelete && row("account-off-outline", "Скрыть автора",
            () => void run(
              () => feedApi.setAuthorPreference(post.author.id, { hidden: true }),
              "Публикации автора скрыты в разделе «Моменты»",
              true,
            ))}
          {!post.canDelete && row("flag-outline", "Пожаловаться", requestReport)}
          {post.canEdit && row("pencil-outline", "Редактировать", () => { setOpen(false); onEdit(); })}
          {post.canDelete && row("delete-outline", "Удалить", () => { setOpen(false); onDelete(); }, true)}
        </View>
      </View>
    </Modal>
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
  popoverOverlay: { flex: 1 },
  popover: {
    position: "absolute",
    padding: 7,
    borderRadius: 17,
    backgroundColor: "#FBF7EF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(77, 92, 45, 0.19)",
    shadowColor: "#352E2E",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 17,
    elevation: 9,
  },
  popoverRow: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  popoverRowPressed: { backgroundColor: "#E8EBD9" },
  popoverLabel: { flexShrink: 1, fontFamily: FONTS.montserratMedium, fontSize: 13, color: COLORS.text },
  popoverDanger: { color: "#A34842" },
  input: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: 8, minHeight: 88, padding: 12, color: COLORS.text, fontFamily: FONTS.montserrat },
  error: { color: COLORS.error, paddingVertical: 8 },
});
