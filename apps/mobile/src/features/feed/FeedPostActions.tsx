import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FEED_REPORT_REASONS, type FeedPostDto, type FeedReportReason } from "@gafus/types";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import {
  feedAuthorPreferenceGuarded,
  feedBookmarkGuarded,
  feedPostFeedbackGuarded,
  feedReportGuarded,
} from "@/shared/lib/api/feed";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { SwipeDismissHandle } from "@/shared/components/gestures/SwipeDismissHandle";

function Sheet({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Закрыть" onPress={close} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <SwipeDismissHandle close={close} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {children}
            <Pressable accessibilityRole="button" style={styles.row} onPress={close}>
              <Text style={styles.label}>Закрыть</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
type ReportActor = { ownerId: string; authEpoch: string };
const REPORT_UNKNOWN =
  "Результат отправки жалобы неизвестен. Проверьте статус перед повторной попыткой.";

function currentReportActor(): ReportActor | null {
  const state = useAuthStore.getState();
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (
    !state.isAuthenticated ||
    state.isLoading ||
    !state.user?.id ||
    binding?.principalId !== state.user.id ||
    !binding.authEpoch
  )
    return null;
  return { ownerId: state.user.id, authEpoch: binding.authEpoch };
}
function sameReportActor(actor: ReportActor): boolean {
  const current = currentReportActor();
  return current?.ownerId === actor.ownerId && current.authEpoch === actor.authEpoch;
}

export function FeedReportButton({
  type,
  id,
  authorId,
}: {
  type: "post" | "comment";
  id: string;
  authorId: string;
}) {
  const ownerId = useAuthStore((state) =>
    state.isAuthenticated && !state.isLoading ? state.user?.id : null,
  );
  const actor = currentReportActor();
  if (!ownerId || ownerId === authorId || actor?.ownerId !== ownerId) return null;
  return (
    <ActorFeedReportButton
      key={`${actor.ownerId}:${actor.authEpoch}:${type}:${id}`}
      actor={actor}
      type={type}
      id={id}
    />
  );
}

function ActorFeedReportButton({
  actor,
  type,
  id,
}: {
  actor: ReportActor;
  type: "post" | "comment";
  id: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        style={styles.row}
        onPress={() => {
          if (sameReportActor(actor)) setOpen(true);
        }}
      >
        <Text style={styles.label}>Пожаловаться</Text>
      </Pressable>
      {open && <FeedReportSheet type={type} id={id} close={() => setOpen(false)} />}
    </>
  );
}

function FeedReportSheet({
  type,
  id,
  close,
}: {
  type: "post" | "comment";
  id: string;
  close: () => void;
}) {
  const ownerId = useAuthStore((state) =>
    state.isAuthenticated && !state.isLoading ? state.user?.id : null,
  );
  const actor = currentReportActor();
  if (!ownerId || !actor || actor.ownerId !== ownerId) {
    return (
      <Sheet title="Пожаловаться" close={close}>
        <Text accessibilityRole="alert" style={styles.error}>
          Для отправки жалобы требуется подтверждённая сессия.
        </Text>
      </Sheet>
    );
  }
  return (
    <ActorFeedReportSheet
      key={`${actor.ownerId}:${actor.authEpoch}:${type}:${id}`}
      actor={actor}
      type={type}
      id={id}
      close={close}
    />
  );
}

function ActorFeedReportSheet({
  actor,
  type,
  id,
  close,
}: {
  actor: ReportActor;
  type: "post" | "comment";
  id: string;
  close: () => void;
}) {
  const [reason, setReason] = useState<FeedReportReason>("spam");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const unknown = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () => mounted.current && sameReportActor(actor);
  const closeSafe = () => {
    if (!inFlight.current) close();
  };
  const submit = async () => {
    if (inFlight.current || unknown.current || !current()) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const trimmed = comment.trim();
      const result = await feedReportGuarded(
        type,
        id,
        { reason, ...(trimmed ? { comment: trimmed } : {}) },
        current,
      );
      if (!current()) return;
      if (!result || typeof result.id !== "string" || !result.id.trim())
        throw new Error("FEED_REPORT_ACK_INVALID");
      close();
      Alert.alert("Жалоба отправлена", "Мы рассмотрим её. Спасибо.");
    } catch {
      // Do not log report text, private IDs, server exception or signed URLs.
      reportClientError(new Error("FEED_REPORT_RESULT_UNCONFIRMED"), {
        issueKey: "FeedReportSheet",
        keys: { operation: "submit" },
      });
      if (current()) {
        unknown.current = true;
        setError(REPORT_UNKNOWN);
      }
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  };
  return (
    <Sheet title="Пожаловаться" close={closeSafe}>
      {Object.entries(FEED_REPORT_REASONS).map(([key, label]) => (
        <Pressable
          key={key}
          accessibilityRole="radio"
          accessibilityState={{ checked: reason === key }}
          style={styles.row}
          disabled={busy || unknown.current || !current()}
          onPress={() => setReason(key as FeedReportReason)}
        >
          <MaterialCommunityIcons
            name={reason === key ? "radiobox-marked" : "radiobox-blank"}
            size={22}
            color={COLORS.primary}
          />
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      ))}
      <TextInput
        accessibilityLabel="Комментарий к жалобе"
        placeholder="Комментарий (необязательно)"
        placeholderTextColor={COLORS.textSecondary}
        style={styles.input}
        multiline
        maxLength={1000}
        value={comment}
        editable={!busy && !unknown.current && current()}
        onChangeText={setComment}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy || unknown.current || !current()}
        style={styles.row}
        onPress={() => void submit()}
      >
        <Text style={styles.label}>{busy ? "Отправляем…" : "Отправить жалобу"}</Text>
      </Pressable>
    </Sheet>
  );
}
type FeedPostActionsProps = {
  post: FeedPostDto;
  onEdit: () => void;
  onDelete: () => void;
};

export function FeedPostActions(props: FeedPostActionsProps) {
  const ownerId = useAuthStore((state) =>
    state.isAuthenticated && !state.isLoading ? state.user?.id : null,
  );
  const verified = currentReportActor();
  const actor = verified?.ownerId === ownerId ? verified : null;
  return (
    <ActorFeedPostActions
      key={`${actor?.ownerId ?? "guest"}:${actor?.authEpoch ?? "none"}:${props.post.id}:${props.post.author.id}`}
      {...props}
      actor={actor}
    />
  );
}

function ActorFeedPostActions({
  post,
  onEdit,
  onDelete,
  actor,
}: FeedPostActionsProps & { actor: ReportActor | null }) {
  const triggerRef = useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const copyFlight = useRef(false);
  const [authorBusy, setAuthorBusy] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const feedbackFlight = useRef(false);
  const feedbackUnknown = useRef(false);
  const feedbackConfirmed = useRef(false);
  const ownerEntryClaimed = useRef(false);
  const mounted = useRef(true);
  const bookmarkFlight = useRef(false);
  const bookmarkUnknown = useRef(false);
  const confirmedBookmarked = useRef<boolean | null>(null);
  const authorFlight = useRef(false);
  const authorUnknown = useRef(false);
  const confirmedHidden = useRef<boolean | null>(null);
  const confirmedNotify = useRef<boolean | null>(null);
  const cache = useQueryClient();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentBookmark = () => mounted.current && actor !== null && sameReportActor(actor);
  const currentOwner = () =>
    currentBookmark() && actor !== null && post.author.id === actor.ownerId;
  const currentAuthorAction = () =>
    currentBookmark() && actor !== null && post.author.id !== actor.ownerId;
  const currentRecommendationFeedback = () =>
    currentBookmark() && !post.canDelete && Boolean(post.recommendationReason);
  const canManageAuthor = !post.canDelete && currentAuthorAction();
  const openMenu = () => {
    if (
      copyFlight.current ||
      authorFlight.current ||
      bookmarkFlight.current ||
      feedbackFlight.current
    )
      return;
    ownerEntryClaimed.current = false;
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
  // Copying a public link does not mutate the feed and must not refetch private caches.
  const currentCopy = () =>
    mounted.current && (actor ? sameReportActor(actor) : currentReportActor() === null);
  async function copyPublicLink() {
    if (copyFlight.current || !currentCopy()) return;
    copyFlight.current = true;
    setCopyBusy(true);
    setOpen(false);
    try {
      await Clipboard.setStringAsync(`https://gafus.ru/feed/${encodeURIComponent(post.id)}`);
      if (currentCopy()) Alert.alert("Моменты", "Ссылка скопирована");
    } catch {
      reportClientError(new Error("FEED_COPY_LINK_UNCONFIRMED"), {
        issueKey: "FeedPostActions",
        keys: { operation: "copy_public_link" },
      });
      if (currentCopy()) Alert.alert("Моменты", "Не удалось скопировать ссылку.");
    } finally {
      copyFlight.current = false;
      if (currentCopy()) setCopyBusy(false);
    }
  }
  async function changeAuthorVisibility(nextHidden: boolean) {
    if (
      authorFlight.current ||
      authorUnknown.current ||
      confirmedHidden.current === nextHidden ||
      !currentAuthorAction()
    )
      return;
    authorFlight.current = true;
    setAuthorBusy(true);
    setOpen(false);
    try {
      const ack = await feedAuthorPreferenceGuarded(
        post.author.id,
        { hidden: nextHidden },
        currentAuthorAction,
      );
      if (!currentAuthorAction()) return;
      if (!ack || ack.hidden !== nextHidden || typeof ack.notify !== "boolean")
        throw new Error("FEED_AUTHOR_VISIBILITY_ACK_MISMATCH");
      // Server ACK is authoritative. Cache failure cannot erase it or allow a second hide.
      confirmedHidden.current = nextHidden;
      try {
        await cache.invalidateQueries({ queryKey: ["feed"] });
      } catch {
        reportClientError(new Error("FEED_AUTHOR_VISIBILITY_CACHE_REFRESH_FAILED"), {
          issueKey: "FeedPostActions",
          keys: { operation: "author_visibility_cache" },
        });
      }
      if (!currentAuthorAction()) return;
      Alert.alert(
        "Моменты",
        nextHidden
          ? "Публикации автора скрыты в разделе «Моменты»"
          : "Публикации автора снова видны в «Моментах»",
        nextHidden
          ? [
              { text: "Готово" },
              {
                text: "Отменить",
                onPress: () => {
                  if (currentAuthorAction()) void changeAuthorVisibility(false);
                },
              },
            ]
          : undefined,
      );
    } catch {
      if (!currentAuthorAction()) return;
      authorUnknown.current = true;
      reportClientError(new Error("FEED_AUTHOR_VISIBILITY_UNCONFIRMED"), {
        issueKey: "FeedPostActions",
        keys: { operation: "author_visibility" },
      });
      Alert.alert(
        "Моменты",
        "Результат изменения видимости неизвестен. Проверьте результат перед повторной попыткой.",
      );
    } finally {
      authorFlight.current = false;
      if (currentAuthorAction()) setAuthorBusy(false);
    }
  }
  async function changeAuthorNotifications(nextNotify: boolean) {
    if (
      authorFlight.current ||
      authorUnknown.current ||
      confirmedHidden.current === true ||
      confirmedNotify.current === nextNotify ||
      !currentAuthorAction()
    )
      return;
    authorFlight.current = true;
    setAuthorBusy(true);
    setOpen(false);
    try {
      const ack = await feedAuthorPreferenceGuarded(
        post.author.id,
        { notify: nextNotify },
        currentAuthorAction,
      );
      if (!currentAuthorAction()) return;
      if (!ack || ack.notify !== nextNotify || typeof ack.hidden !== "boolean")
        throw new Error("FEED_AUTHOR_NOTIFY_ACK_MISMATCH");
      confirmedNotify.current = nextNotify;
      try {
        await cache.invalidateQueries({ queryKey: ["feed"] });
      } catch {
        reportClientError(new Error("FEED_AUTHOR_NOTIFY_CACHE_REFRESH_FAILED"), {
          issueKey: "FeedPostActions",
          keys: { operation: "author_notify_cache" },
        });
      }
      if (!currentAuthorAction()) return;
      Alert.alert(
        "Моменты",
        nextNotify
          ? "Подписка включена. Разрешите push в настройках уведомлений, чтобы получать новые посты."
          : "Уведомления отключены",
      );
    } catch {
      if (!currentAuthorAction()) return;
      authorUnknown.current = true;
      reportClientError(new Error("FEED_AUTHOR_NOTIFY_UNCONFIRMED"), {
        issueKey: "FeedPostActions",
        keys: { operation: "author_notify" },
      });
      Alert.alert(
        "Моменты",
        "Результат изменения уведомлений неизвестен. Проверьте результат перед повторной попыткой.",
      );
    } finally {
      authorFlight.current = false;
      if (currentAuthorAction()) setAuthorBusy(false);
    }
  }
  const displayedAuthorNotify = confirmedNotify.current ?? Boolean(post.authorNotify);
  async function changeBookmark(nextSaved: boolean) {
    if (
      bookmarkFlight.current ||
      bookmarkUnknown.current ||
      confirmedBookmarked.current === nextSaved ||
      !currentBookmark()
    )
      return;
    bookmarkFlight.current = true;
    setBookmarkBusy(true);
    setOpen(false);
    try {
      const ack = await feedBookmarkGuarded(post.id, nextSaved, currentBookmark);
      if (!currentBookmark()) return;
      if (!ack || ack.saved !== nextSaved) throw new Error("FEED_BOOKMARK_ACK_MISMATCH");
      confirmedBookmarked.current = nextSaved;
      try {
        await cache.invalidateQueries({ queryKey: ["feed"] });
      } catch {
        reportClientError(new Error("FEED_BOOKMARK_CACHE_REFRESH_FAILED"), {
          issueKey: "FeedPostActions",
          keys: { operation: "bookmark_cache" },
        });
      }
      if (!currentBookmark()) return;
      Alert.alert("Моменты", nextSaved ? "Публикация сохранена" : "Публикация убрана из закладок");
    } catch {
      if (!currentBookmark()) return;
      bookmarkUnknown.current = true;
      reportClientError(new Error("FEED_BOOKMARK_RESULT_UNCONFIRMED"), {
        issueKey: "FeedPostActions",
        keys: { operation: "bookmark" },
      });
      Alert.alert(
        "Моменты",
        "Результат сохранения в закладках неизвестен. Проверьте результат перед повторной попыткой.",
      );
    } finally {
      bookmarkFlight.current = false;
      if (currentBookmark()) setBookmarkBusy(false);
    }
  }
  const displayedBookmarked = confirmedBookmarked.current ?? Boolean(post.bookmarked);
  async function setRecommendationNotInterested() {
    if (
      feedbackFlight.current ||
      feedbackUnknown.current ||
      feedbackConfirmed.current ||
      !currentRecommendationFeedback()
    )
      return;
    feedbackFlight.current = true;
    setFeedbackBusy(true);
    setOpen(false);
    try {
      const ack = await feedPostFeedbackGuarded(post.id, currentRecommendationFeedback);
      if (!currentRecommendationFeedback()) return;
      if (!ack || ack.saved !== true) throw new Error("FEED_FEEDBACK_ACK_MISMATCH");
      // A positive server ACK survives cache refresh failures; never replay the POST.
      feedbackConfirmed.current = true;
      try {
        await cache.invalidateQueries({ queryKey: ["feed"] });
      } catch {
        reportClientError(new Error("FEED_FEEDBACK_CACHE_REFRESH_FAILED"), {
          issueKey: "FeedPostActions",
          keys: { operation: "feedback_cache" },
        });
      }
      if (!currentRecommendationFeedback()) return;
      Alert.alert("Моменты", "Эта публикация больше не будет показываться в рекомендациях");
    } catch {
      if (!currentRecommendationFeedback()) return;
      feedbackUnknown.current = true;
      reportClientError(new Error("FEED_FEEDBACK_RESULT_UNCONFIRMED"), {
        issueKey: "FeedPostActions",
        keys: { operation: "recommendation_feedback" },
      });
      Alert.alert(
        "Моменты",
        "Результат обратной связи неизвестен. Проверьте результат перед повторной попыткой.",
      );
    } finally {
      feedbackFlight.current = false;
      if (currentRecommendationFeedback()) setFeedbackBusy(false);
    }
  }
  type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
  const row = (
    icon: IconName,
    label: string,
    action: () => void,
    destructive = false,
    disabled = false,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      disabled={copyBusy || authorBusy || bookmarkBusy || feedbackBusy || disabled}
      onPress={(event) => {
        event.stopPropagation();
        action();
      }}
      style={({ pressed }) => [styles.popoverRow, pressed && styles.popoverRowPressed]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={destructive ? "#A34842" : COLORS.primary}
      />
      <Text style={[styles.popoverLabel, destructive && styles.popoverDanger]}>{label}</Text>
    </Pressable>
  );

  const menuWidth = Math.min(266, screenWidth - 24);
  const optionCount =
    2 +
    (!post.canDelete ? 3 : 0) +
    (post.canEdit ? 1 : 0) +
    (post.canDelete ? 1 : 0) +
    (post.recommendationReason ? 1 : 0) +
    (!post.canDelete && post.recommendationReason ? 1 : 0);
  const menuHeight = optionCount * 44 + 14;
  const safeTop = insets.top + 8;
  const maxTop = Math.max(safeTop, screenHeight - insets.bottom - menuHeight - 12);
  const below = anchor ? anchor.y + anchor.height + 5 : safeTop;
  const above = anchor ? anchor.y - menuHeight - 5 : safeTop;
  const top = Math.max(safeTop, Math.min(maxTop, below <= maxTop ? below : above));
  const left = anchor
    ? Math.max(12, Math.min(screenWidth - menuWidth - 12, anchor.x + anchor.width - menuWidth + 4))
    : 12;

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel="Действия с публикацией"
        accessibilityState={{ expanded: open, disabled: copyBusy }}
        hitSlop={4}
        style={styles.menu}
        onPress={(event) => {
          event.stopPropagation();
          openMenu();
        }}
      >
        <MaterialCommunityIcons name="dots-horizontal" size={24} color={COLORS.primary} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        onDismiss={() => {
          if (reportPending) {
            setReportPending(false);
            setReport(true);
          }
        }}
      >
        <View style={styles.popoverOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Закрыть меню публикации"
            onPress={() => setOpen(false)}
          />
          <View
            style={[styles.popover, { top, left, width: menuWidth }]}
            accessibilityViewIsModal
            accessibilityLabel="Действия с публикацией"
          >
            {currentBookmark() &&
              row(
                displayedBookmarked ? "bookmark" : "bookmark-outline",
                displayedBookmarked ? "Убрать из закладок" : "Сохранить в закладках",
                () => void changeBookmark(!displayedBookmarked),
                false,
                bookmarkUnknown.current,
              )}
            {canManageAuthor &&
              confirmedHidden.current !== true &&
              row(
                displayedAuthorNotify ? "bell-off-outline" : "bell-outline",
                displayedAuthorNotify ? "Отключить уведомления" : "Уведомлять о постах",
                () => void changeAuthorNotifications(!displayedAuthorNotify),
                false,
                authorUnknown.current,
              )}
            {row("link-variant", "Скопировать ссылку", () => void copyPublicLink())}
            {post.recommendationReason &&
              row("information-outline", "Почему я вижу эту публикацию?", () => {
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
            {currentRecommendationFeedback() &&
              !feedbackConfirmed.current &&
              row(
                "eye-off-outline",
                "Не интересно",
                () => void setRecommendationNotInterested(),
                false,
                feedbackUnknown.current,
              )}
            {canManageAuthor &&
              confirmedHidden.current !== true &&
              row(
                "account-off-outline",
                "Скрыть автора",
                () => void changeAuthorVisibility(true),
                false,
                authorUnknown.current,
              )}
            {!post.canDelete && row("flag-outline", "Пожаловаться", requestReport)}
            {post.canEdit &&
              currentOwner() &&
              row("pencil-outline", "Редактировать", () => {
                if (ownerEntryClaimed.current || !currentOwner()) return;
                ownerEntryClaimed.current = true;
                setOpen(false);
                onEdit();
              })}
            {post.canDelete &&
              currentOwner() &&
              row(
                "delete-outline",
                "Удалить",
                () => {
                  if (ownerEntryClaimed.current || !currentOwner()) return;
                  ownerEntryClaimed.current = true;
                  setOpen(false);
                  onDelete();
                },
                true,
              )}
          </View>
        </View>
      </Modal>
      {report && <FeedReportSheet type="post" id={post.id} close={() => setReport(false)} />}
    </>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.4)" },
  sheet: {
    backgroundColor: COLORS.cardBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "85%",
  },
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
  popoverLabel: {
    flexShrink: 1,
    fontFamily: FONTS.montserratMedium,
    fontSize: 13,
    color: COLORS.text,
  },
  popoverDanger: { color: "#A34842" },
  input: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    minHeight: 88,
    padding: 12,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  error: { color: COLORS.error, paddingVertical: 8 },
});
