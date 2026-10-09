import { useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  QUESTION_LIMITS,
  QUESTION_REPORT_REASONS,
  type QuestionAnswerDto,
  type QuestionPhotoDto,
} from "@gafus/types";
import { TexturedSafeAreaView } from "@/shared/components";
import { useAuthStore } from "@/shared/stores";
import { COLORS, FONTS } from "@/shared/config";
import { questionsApi } from "@/shared/lib/api/questions";
import { QAuthor, QBody, QButton, QInput, QPhotoPicker, QPhotos, QStatus, st } from "./ui";
import { QuestionPostMenu, type QuestionPostAction } from "./QuestionPostMenu";
import { QuestionAnswerHeart } from "./QuestionAnswerHeart";
function formatAnswerCount(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const form = mod100 >= 11 && mod100 <= 14
    ? "ответов"
    : mod10 === 1
      ? "ответ"
      : mod10 >= 2 && mod10 <= 4
        ? "ответа"
        : "ответов";
  return `${count} ${form}`;
}
export function QuestionDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const cache = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const userId = useAuthStore((s) => s.user?.id);
  const [sort, setSort] = useState("useful");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<QuestionPhotoDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<QuestionAnswerDto | null>(null);
  const [postMenuOpen, setPostMenuOpen] = useState(false);
  const [answerMenuId, setAnswerMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuestionAnswerDto | null>(null);
  const [requestId, setRequestId] = useState(() => Crypto.randomUUID());
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [extraReplies, setExtraReplies] = useState<
    Record<string, { items: QuestionAnswerDto[]; nextPage: number | null }>
  >({});
  const [reportTarget, setReportTarget] = useState<{ answerId?: string } | null>(null);
  const [reason, setReason] = useState<string>(QUESTION_REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["questions", userId, "detail", id, sort],
    queryFn: ({ pageParam }) => questionsApi.detail(id, sort, pageParam),
    initialPageParam: 1,
    getNextPageParam: (p) => p.nextAnswerPage,
    enabled: !!userId,
  });
  const question = query.data?.pages[0];
  const answers = [
    ...new Map(
      [
        ...(query.data?.pages.flatMap((p) => p.answers) ?? []),
        ...Object.values(extraReplies).flatMap((p) => p.items),
      ].map((a) => [a.id, a]),
    ).values(),
  ];
  const run = async (action: () => Promise<unknown>, refresh = true) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (refresh) {
        setExtraReplies({});
        await cache.invalidateQueries({ queryKey: ["questions"] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setBody("");
    setPhotos([]);
    setReplyTo(null);
    setEditing(null);
    setRequestId(Crypto.randomUUID());
  };
  const confirmDelete = (answerId?: string) =>
    Alert.alert(
      "Удалить публикацию?",
      answerId ? "Ответы других пользователей сохранятся." : "Всё обсуждение будет скрыто.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () =>
            void run(async () => {
              if (answerId) await questionsApi.removeAnswer(answerId);
              else {
                await questionsApi.remove(id);
                router.replace("/(main)/(tabs)/questions" as Href);
              }
            }),
        },
      ],
    );
  const questionActions: QuestionPostAction[] = [
    {
      key: "share",
      label: "Поделиться",
      icon: "share-variant-outline",
      onPress: () => {
        void Share.share({ message: `https://gafus.ru/questions/${id}` }).catch(() =>
          setError("Не удалось поделиться вопросом"),
        );
      },
    },
  ];
  if (question && !question.blockReason) {
    questionActions.push({
      key: "report",
      label: "Пожаловаться",
      icon: "flag-outline",
      onPress: () => {
        setReportTarget({});
        scroll.current?.scrollToEnd({ animated: true });
      },
    });
  }
  if (question?.canManage) {
    questionActions.push({
      key: "close",
      label: question.closed ? "Открыть обсуждение" : "Закрыть обсуждение",
      icon: question.closed ? "lock-open-outline" : "lock-outline",
      disabled: busy || !!question.blockReason,
      onPress: () => void run(() => questionsApi.close(id, !question.closed)),
    });
  }
  if (question?.canEdit && !question.blockReason) {
    questionActions.push({
      key: "edit",
      label: "Изменить",
      icon: "pencil-outline",
      onPress: () => router.push(`/questions/${id}/edit` as Href),
    });
  }
  if (question?.canManage) {
    questionActions.push({
      key: "delete",
      label: "Удалить",
      icon: "trash-can-outline",
      disabled: busy,
      destructive: true,
      onPress: () => confirmDelete(),
    });
  }
  const selectedAnswer = answers.find(
    (answer) => answer.id === answerMenuId && !answer.deleted && !answer.hidden,
  );
  const answerActions: QuestionPostAction[] = [];
  if (selectedAnswer) {
    if (question?.canManage) {
      answerActions.push({
        key: "best",
        label: selectedAnswer.best ? "Снять лучший ответ" : "Выбрать лучшим",
        icon: selectedAnswer.best ? "star-off-outline" : "star-outline",
        disabled: busy || !!question.blockReason,
        onPress: () =>
          void run(() => questionsApi.best(id, selectedAnswer.best ? null : selectedAnswer.id)),
      });
    }
    if (selectedAnswer.canEdit && !question?.blockReason) {
      answerActions.push({
        key: "edit",
        label: "Изменить",
        icon: "pencil-outline",
        onPress: () => {
          reset();
          setEditing(selectedAnswer);
          setBody(selectedAnswer.body);
          setPhotos(selectedAnswer.photos);
          scroll.current?.scrollToEnd({ animated: true });
        },
      });
    }
    if (selectedAnswer.canDelete) {
      answerActions.push({
        key: "delete",
        label: "Удалить",
        icon: "trash-can-outline",
        disabled: busy,
        destructive: true,
        onPress: () => confirmDelete(selectedAnswer.id),
      });
    }
    if (!question?.blockReason) {
      answerActions.push({
        key: "report",
        label: "Пожаловаться",
        icon: "flag-outline",
        onPress: () => {
          setReportTarget({ answerId: selectedAnswer.id });
          scroll.current?.scrollToEnd({ animated: true });
        },
      });
    }
  }
  const threadControls = (root: QuestionAnswerDto) => {
    if (root.parentId || root.replyCount === 0) return null;
    const hidden = collapsed.includes(root.id);
    const loadedReplyCount = answers.filter((answer) => answer.parentId === root.id).length;
    const canLoadMore =
      !hidden && extraReplies[root.id]?.nextPage !== null && root.replyCount > loadedReplyCount;
    return (
      <View style={styles.threadControls}>
        {canLoadMore && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Показать ещё ответы в ветке"
            disabled={busy}
            hitSlop={6}
            style={({ pressed }) => [styles.threadAction, (busy || pressed) && styles.pressed]}
            onPress={() =>
              void run(async () => {
                const page = await questionsApi.replies(
                  root.id,
                  extraReplies[root.id]?.nextPage ?? 2,
                );
                setExtraReplies((v) => ({
                  ...v,
                  [root.id]: {
                    ...page,
                    items: [...(v[root.id]?.items ?? []), ...page.items],
                  },
                }));
              }, false)
            }
          >
            <View style={styles.threadLine} />
            <Text style={styles.threadActionText}>Смотреть ещё ответы</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden ? `Показать ответы (${root.replyCount})` : "Скрыть ответы"}
          hitSlop={6}
          style={({ pressed }) => [styles.threadAction, pressed && styles.pressed]}
          onPress={() =>
            setCollapsed((v) =>
              v.includes(root.id) ? v.filter((id) => id !== root.id) : [...v, root.id],
            )
          }
        >
          <View style={styles.threadLine} />
          <Text style={styles.threadActionText}>
            {hidden ? `Показать ответы (${root.replyCount})` : "Скрыть ответы"}
          </Text>
        </Pressable>
      </View>
    );
  };
  const card = (answer: QuestionAnswerDto) => (
    <View
      key={answer.id}
      style={[
        st.answer,
        answer.best && st.best,
        answer.parentId && !answer.best && st.reply,
        styles.compactAnswer,
        answer.parentId && !answer.best && styles.nestedReply,
      ]}
    >
      {answer.best && <Text style={[st.badge, st.resolved]}>Лучший ответ</Text>}
      <QAuthor author={answer.author} date={answer.createdAt} edited={answer.editedAt} compact />
      <View style={styles.answerDetails}>
        <View style={styles.answerContentRow}>
          <View style={styles.answerContent}>
            <QBody text={answer.body} compact replyToName={answer.replyToName} />
            {answer.photos.length > 0 && <QPhotos photos={answer.photos} />}
          </View>
        </View>
        {!answer.deleted && !answer.hidden && (
          <View style={styles.answerActionsRow}>
            {question?.canReply && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ответить пользователю ${answer.author.name}`}
                hitSlop={8}
                onPress={() => {
                  reset();
                  setReplyTo(answer);
                  scroll.current?.scrollToEnd({ animated: true });
                }}
                style={({ pressed }) => [styles.answerSmallAction, pressed && styles.pressed]}
              >
                <Text style={styles.answerActionText}>Ответить</Text>
              </Pressable>
            )}
            {(question?.canManage ||
              answer.canDelete ||
              (answer.canEdit && !question?.blockReason) ||
              !question?.blockReason) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ещё действия с ответом"
                accessibilityState={{ expanded: answerMenuId === answer.id }}
                hitSlop={8}
                onPress={() => setAnswerMenuId(answer.id)}
                style={({ pressed }) => [styles.answerSmallAction, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name="dots-horizontal"
                  size={22}
                  color={COLORS.textSecondary}
                />
              </Pressable>
            )}
          </View>
        )}
        {threadControls(answer)}
        {!answer.deleted && !answer.hidden && (
          <QuestionAnswerHeart
            liked={answer.liked}
            hearts={answer.hearts}
            disabled={!!question?.blockReason}
            onToggle={(nextLiked) => questionsApi.heart(answer.id, nextLiked)}
            onSuccess={() => cache.invalidateQueries({ queryKey: ["questions"] })}
            onError={(reason) => {
              setError(
                reason instanceof Error ? reason.message : "Не удалось поставить сердечко",
              );
            }}
          />
        )}
      </View>
    </View>
  );

  return (
    <TexturedSafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[st.content, styles.detailContent]}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                setExtraReplies({});
                void query.refetch();
              }}
            />
          }
        >
          <QButton
            label="Все вопросы"
            secondary
            icon="arrow-left"
            onPress={() => router.replace("/(main)/(tabs)/questions" as Href)}
          />
          {query.isPending && <Text style={st.meta}>Загрузка вопроса…</Text>}
          {query.isError && (
            <View style={st.group}>
              <Text accessibilityRole="alert" style={st.error}>
                {query.error.message}
              </Text>
              <QButton label="Повторить" secondary onPress={() => void query.refetch()} />
            </View>
          )}
          {error && (
            <Text accessibilityRole="alert" style={st.error}>
              {error}
            </Text>
          )}
          {notice && <Text style={st.notice}>{notice}</Text>}
          {question && (
            <>
              <View style={[st.card, styles.questionCard]}>
                <View style={styles.postHeader}>
                  <View style={styles.authorArea}>
                    <QAuthor
                      author={question.author}
                      date={question.createdAt}
                      edited={question.editedAt}
                      compact
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Действия с вопросом"
                    accessibilityHint="Открыть меню: поделиться, жалоба и действия автора"
                    accessibilityState={{ expanded: postMenuOpen }}
                    hitSlop={10}
                    onPress={() => setPostMenuOpen(true)}
                    style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
                  >
                    <MaterialCommunityIcons
                      name="dots-horizontal"
                      size={23}
                      color={COLORS.primary}
                    />
                  </Pressable>
                </View>
                <Text style={[st.title, styles.questionTitle]}>{question.title}</Text>
                <QStatus question={question} />
                <QBody text={question.body} compact />
                {question.photos.length > 0 && <QPhotos photos={question.photos} />}
                <Text style={[st.meta, styles.questionMeta]}>
                  {formatAnswerCount(question.answerCount)} · {question.viewCount} просмотров
                </Text>
                <QuestionPostMenu
                  visible={postMenuOpen}
                  onClose={() => setPostMenuOpen(false)}
                  actions={questionActions}
                />
              </View>
              <View style={[st.card, styles.answersCard]}>
                <View style={styles.answersToolbar}>
                  <Text style={styles.answersHeading}>
                    {formatAnswerCount(question.answerCount)}
                  </Text>
                  <View style={styles.answerSortRow} accessibilityRole="radiogroup">
                    {([
                      ["useful", "Полезные"],
                      ["new", "Новые"],
                    ] as const).map(([value, label]) => (
                      <Pressable
                        key={value}
                        accessibilityRole="radio"
                        accessibilityLabel={`Сортировать: ${label}`}
                        accessibilityState={{ selected: sort === value, checked: sort === value }}
                        hitSlop={6}
                        onPress={() => {
                          setSort(value);
                          setExtraReplies({});
                        }}
                        style={({ pressed }) => [
                          styles.answerSortButton,
                          sort === value && styles.answerSortSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.answerSortText,
                            sort === value && styles.answerSortTextSelected,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {!answers.length && (
                  <Text style={st.meta}>Пока никто не ответил. Поделитесь опытом первым.</Text>
                )}
                {answers
                  .filter((a) => a.best || !a.parentId)
                  .map((root) => (
                    <View key={root.id}>
                      {card(root)}
                      {!root.parentId &&
                        !collapsed.includes(root.id) &&
                        answers.filter((a) => a.parentId === root.id && !a.best).map(card)}
                    </View>
                  ))}
                {query.hasNextPage && (
                  <QButton
                    label={query.isFetchingNextPage ? "Загрузка…" : "Ещё ответы"}
                    secondary
                    disabled={query.isFetchingNextPage}
                    onPress={() => void query.fetchNextPage()}
                  />
                )}
              </View>
              <QuestionPostMenu
                title="Действия с ответом"
                visible={!!selectedAnswer}
                onClose={() => setAnswerMenuId(null)}
                actions={answerActions}
              />
              {question.blockReason && (
                <Text style={st.notice}>Публикации заблокированы: {question.blockReason}</Text>
              )}
              {question.closed && (
                <Text style={st.notice}>Обсуждение закрыто. Новые ответы недоступны.</Text>
              )}
              {reportTarget && (
                <View style={st.card}>
                  <Text style={st.title}>
                    Пожаловаться на {reportTarget.answerId ? "ответ" : "вопрос"}
                  </Text>
                  <View style={st.row}>
                    {QUESTION_REPORT_REASONS.map((v) => (
                      <QButton
                        key={v}
                        label={v}
                        secondary
                        selected={reason === v}
                        onPress={() => setReason(v)}
                      />
                    ))}
                  </View>
                  <QInput
                    label="Подробности"
                    value={details}
                    onChange={setDetails}
                    multiline
                    maxLength={1000}
                  />
                  <QButton
                    label="Отправить жалобу"
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await questionsApi.report(id, { ...reportTarget, reason, details });
                        setReportTarget(null);
                        setDetails("");
                        setNotice("Жалоба отправлена администратору");
                      })
                    }
                  />
                  <QButton label="Отмена" secondary onPress={() => setReportTarget(null)} />
                </View>
              )}
              {(question.canReply || editing) && (
                <View style={st.card}>
                  <QInput
                    label={
                      editing
                        ? "Редактировать ответ"
                        : replyTo
                          ? `Ответ для ${replyTo.author.name}`
                          : "Ваш ответ"
                    }
                    value={body}
                    onChange={setBody}
                    multiline
                    maxLength={QUESTION_LIMITS.body}
                    placeholder="Поделитесь своим опытом"
                  />
                  <QPhotoPicker photos={photos} onChange={setPhotos} onBusy={setUploading} />
                  <QButton
                    label={busy ? "Отправка…" : editing ? "Сохранить" : "Ответить"}
                    disabled={busy || uploading || !body.trim()}
                    onPress={() =>
                      void run(async () => {
                        if (editing)
                          await questionsApi.editAnswer(editing.id, {
                            body,
                            photoIds: photos.map((p) => p.id),
                          });
                        else
                          await questionsApi.answer(id, {
                            body,
                            photoIds: photos.map((p) => p.id),
                            replyToId: replyTo?.id,
                            clientRequestId: requestId,
                          });
                        reset();
                      })
                    }
                  />
                  {(replyTo || editing) && <QButton label="Отмена" secondary onPress={reset} />}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </TexturedSafeAreaView>
  );
}
const styles = StyleSheet.create({
  detailContent: { gap: 12 },
  questionCard: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  questionTitle: { fontSize: 19, lineHeight: 26 },
  questionMeta: { fontSize: 11, lineHeight: 16, marginTop: 1 },
  answersCard: { paddingHorizontal: 14, paddingVertical: 12, gap: 7 },
  answersToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 2,
  },
  answersHeading: {
    fontFamily: FONTS.montserratBold,
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 22,
  },
  answerSortRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  answerSortButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  answerSortSelected: { backgroundColor: "#e1e6d0" },
  answerSortText: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  answerSortTextSelected: { color: COLORS.primary },
  // Root answers get one subtle divider. Nested replies use indentation, not extra cards.
  compactAnswer: { gap: 0, paddingTop: 8, paddingBottom: 4 },
  nestedReply: {
    borderTopWidth: 0,
    borderLeftWidth: 0,
    marginLeft: 24,
    paddingLeft: 0,
    paddingTop: 3,
    paddingBottom: 3,
  },
  // Text follows the one-line name/date; the avatar still has its full 32pt hit area.
  answerDetails: { marginLeft: 40, marginTop: -10, gap: 0, position: "relative" },
  answerContentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  // Fixed icon position does not add 40pt of empty height to one-line comments.
  answerContent: { flex: 1, minWidth: 0, paddingRight: 44, gap: 4 },
  answerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 24,
  },
  answerSmallAction: {
    minHeight: 24,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  answerActionText: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  threadControls: { marginTop: -3, paddingBottom: 0 },
  threadAction: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  threadLine: { width: 18, height: 1, backgroundColor: "#b6bea0" },
  threadActionText: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  authorArea: { flex: 1 },
  moreButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { backgroundColor: "#e1e6d0" },
});