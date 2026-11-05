import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
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
import { AppBackButton, Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { COLORS, FONTS } from "@/shared/config";
import { questionsApi } from "@/shared/lib/api/questions";
import { QAuthor, QBody, QButton, QInput, QPhotoPicker, QPhotos, QStatus, st } from "./ui";
import { QuestionPostMenu, type QuestionPostAction } from "./QuestionPostMenu";
import { QuestionAnswerHeart } from "./QuestionAnswerHeart";
import { validateQuestionAnswerDraft } from "./questionAnswerValidation";
import { questionPhotoPending } from "./photoDisplay";
function formatAnswerCount(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const form =
    mod100 >= 11 && mod100 <= 14
      ? "ответов"
      : mod10 === 1
        ? "ответ"
        : mod10 >= 2 && mod10 <= 4
          ? "ответа"
          : "ответов";
  return `${count} ${form}`;
}
export function QuestionDetailScreen({ id }: { id: string }) {
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && binding?.principalId === owner ? binding.authEpoch : null;
  if (!owner || !epoch) {
    return (
      <TexturedSafeAreaView style={{ flex: 1 }}>
        <Text style={st.error}>Для просмотра обсуждения войдите в аккаунт</Text>
      </TexturedSafeAreaView>
    );
  }
  return (
    <QuestionDetailActorScreen
      key={`${owner}:${epoch}:${id}`}
      id={id}
      owner={owner}
      epoch={epoch}
    />
  );
}

function QuestionDetailActorScreen({
  id,
  owner,
  epoch,
}: {
  id: string;
  owner: string;
  epoch: string;
}) {
  const router = useRouter();
  const cache = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const mounted = useRef(true);
  const answerInputFocused = useRef(false);
  const scrollToAnswer = useCallback(() => {
    if (!answerInputFocused.current) return;
    requestAnimationFrame(() => {
      if (mounted.current && answerInputFocused.current) {
        scroll.current?.scrollToEnd({ animated: true });
      }
    });
  }, []);
  useEffect(() => {
    const listener = Keyboard.addListener("keyboardDidShow", scrollToAnswer);
    return () => listener.remove();
  }, [scrollToAnswer]);
  const answerSending = useRef(false);
  const actionInFlight = useRef(false);
  const topPageInFlight = useRef<{ sort: string; generation: number } | null>(null);
  type NestedReadFlight = { sort: string; generation: number; page: number; pending: boolean };
  const nestedReadFlights = useRef(new Map<string, NestedReadFlight>());
  const [nestedReadLoading, setNestedReadLoading] = useState<Record<string, NestedReadFlight>>({});
  const [nestedReadErrors, setNestedReadErrors] = useState<Record<string, NestedReadFlight>>({});
  const actionUnknownRef = useRef(false);
  const [actionUnknown, setActionUnknown] = useState(false);
  const unknownAnswerRef = useRef(false);
  const [unknownAnswer, setUnknownAnswer] = useState(false);
  const current = () => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      state.isAuthenticated &&
      !state.isLoading &&
      state.user?.id === owner &&
      binding?.principalId === owner &&
      binding.authEpoch === epoch
    );
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [sort, setSort] = useState("useful");
  const sortRef = useRef("useful");
  const sortGeneration = useRef(0);
  const [rootPageError, setRootPageError] = useState<{
    sort: string;
    generation: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<QuestionPhotoDto[]>([]);
  const photoSubmitRef = useRef<(() => Promise<QuestionPhotoDto[]>) | null>(null);
  const [uploading, setUploading] = useState(false);
  // Same three-minute retry window as the Web photo gallery. A user can
  // explicitly check again if the isolated worker has stopped.
  const [photoPollOverdue,setPhotoPollOverdue]=useState(false);
  const [photoPollRestart,setPhotoPollRestart]=useState(0);
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
    queryKey: ["questions", owner, epoch, "detail", id, sort],
    queryFn: ({ pageParam }) => questionsApi.detail(id, sort, pageParam),
    initialPageParam: 1,
    getNextPageParam: (p) => p.nextAnswerPage,
    enabled: true,
    // Poll only while photos are processing; stop immediately after READY.
    refetchInterval: (queryState) => {
      const pages=queryState.state.data?.pages;
      return !photoPollOverdue && pages?.some(page=>questionPhotoPending(page.photos)||
        page.answers.some(answer=>questionPhotoPending(answer.photos))) ? 4000 : false;
    },
  });
  const hasPendingPhoto=query.data?.pages.some(page=>questionPhotoPending(page.photos)||
    page.answers.some(answer=>questionPhotoPending(answer.photos))) ?? false;
  useEffect(()=>{
    if(!hasPendingPhoto){setPhotoPollOverdue(false);return;}
    const timer=setTimeout(()=>setPhotoPollOverdue(true),180_000);
    return ()=>clearTimeout(timer);
  },[hasPendingPhoto,photoPollRestart]);
  const retryPendingPhoto=()=>{
    setPhotoPollOverdue(false);
    setPhotoPollRestart(n=>n+1);
    void query.refetch();
  };
  const rootPageFailed =
    query.isFetchNextPageError ||
    (rootPageError?.sort === sort && rootPageError.generation === sortGeneration.current);
  const loadNextRootAnswers = async () => {
    const generation = sortGeneration.current;
    if (
      query.isFetchingNextPage ||
      (query.isError && !query.isFetchNextPageError && !rootPageFailed) ||
      !query.hasNextPage ||
      !current() ||
      sortRef.current !== sort ||
      (topPageInFlight.current?.sort === sort &&
        topPageInFlight.current.generation === generation)
    )
      return;
    const flight = { sort, generation };
    topPageInFlight.current = flight;
    setRootPageError(null);
    const failed = () => {
      if (!current() || sortRef.current !== sort || sortGeneration.current !== generation) return;
      reportClientError(new Error("QUESTION_ROOT_ANSWERS_NEXT_PAGE_FAILED"), {
        issueKey: "QuestionDetail",
        keys: { operation: "next_page" },
      });
      setRootPageError(flight);
    };
    try {
      const result = await query.fetchNextPage();
      if (result?.isFetchNextPageError) failed();
    } catch {
      if (current() && sortRef.current === sort && sortGeneration.current === generation) {
        reportClientError(new Error("QUESTION_ROOT_ANSWERS_NEXT_PAGE_FAILED"), {
          issueKey: "QuestionDetail",
          keys: { operation: "next_page" },
        });
        setRootPageError(flight);
      }
    } finally {
      if (topPageInFlight.current === flight) topPageInFlight.current = null;
    }
  };
  const question = query.data?.pages[0];
  const { answersById, rootAnswers, childrenByRoot, loadedReplyCountByRoot } = useMemo(() => {
    const answersById = new Map<string, QuestionAnswerDto>();
    for (const page of query.data?.pages ?? []) {
      for (const answer of page.answers) answersById.set(answer.id, answer);
    }
    for (const page of Object.values(extraReplies)) {
      for (const answer of page.items) answersById.set(answer.id, answer);
    }

    // Map#set keeps first insertion order but replaces duplicate IDs with the latest value.
    const rootAnswers: QuestionAnswerDto[] = [];
    const childrenByRoot = new Map<string, QuestionAnswerDto[]>();
    const loadedReplyCountByRoot = new Map<string, number>();
    for (const answer of answersById.values()) {
      if (answer.best || !answer.parentId) rootAnswers.push(answer);
      if (answer.parentId) {
        loadedReplyCountByRoot.set(
          answer.parentId,
          (loadedReplyCountByRoot.get(answer.parentId) ?? 0) + 1,
        );
        // A nested best answer is displayed as a root, but still counts as a loaded reply.
        if (!answer.best) {
          const children = childrenByRoot.get(answer.parentId);
          if (children) children.push(answer);
          else childrenByRoot.set(answer.parentId, [answer]);
        }
      }
    }
    return { answersById, rootAnswers, childrenByRoot, loadedReplyCountByRoot };
  }, [query.data?.pages, extraReplies]);
  const run = async (
    action: () => Promise<unknown>,
    refresh = true,
    mutation = true,
    afterAck?: () => void,
  ) => {
    if (
      actionInFlight.current ||
      answerSending.current ||
      !current() ||
      (mutation && actionUnknownRef.current)
    )
      return;
    actionInFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let acknowledged = false;
    try {
      await action();
      if (!current()) return;
      acknowledged = true;
      afterAck?.();
      if (refresh) {
        setExtraReplies({});
        try {
          await cache.invalidateQueries({ queryKey: ["questions"] });
        } catch {
          if (current())
            reportClientError(new Error("QUESTION_DETAIL_CACHE_REFRESH_FAILED"), {
              issueKey: "QuestionDetail",
              keys: { operation: "invalidate" },
            });
        }
      }
    } catch {
      if (current()) {
        reportClientError(
          new Error(
            acknowledged
              ? "QUESTION_DETAIL_POST_ACK_UI_FAILED"
              : mutation
                ? "QUESTION_DETAIL_MUTATION_OUTCOME_UNKNOWN"
                : "QUESTION_DETAIL_READ_FAILED",
          ),
          {
            issueKey: "QuestionDetail",
            keys: { operation: mutation ? "mutation" : "read" },
          },
        );
        if (!acknowledged) {
          if (mutation) {
            actionUnknownRef.current = true;
            setActionUnknown(true);
            setError(
              "Результат действия неизвестен. Обновите обсуждение; повторная отправка заблокирована.",
            );
          } else {
            setError("Не удалось загрузить ответы. Попробуйте ещё раз.");
          }
        }
      }
    } finally {
      actionInFlight.current = false;
      if (current()) setBusy(false);
    }
  };
  const reset = () => {
    setBody("");
    setPhotos([]);
    setReplyTo(null);
    setEditing(null);
    setRequestId(Crypto.randomUUID());
  };
  const submitAnswer = async () => {
    if (
      answerSending.current ||
      actionInFlight.current ||
      unknownAnswerRef.current ||
      busy ||
      uploading ||
      !current()
    )
      return;
    if (!question || question.blockReason || (!question.canReply && !editing)) return;
    const checked = validateQuestionAnswerDraft({
      body,
      photoIds: photos.map((p) => p.id),
      replyToId: replyTo?.id,
    });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    answerSending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let acknowledged = false;
    try {
      // Only the Reply/Save tap authorizes S3 uploads; retain confirmed files on retry.
      let readyPhotos = photos;
      try {
        if (photoSubmitRef.current) readyPhotos = await photoSubmitRef.current();
        else if (photos.some(photo => photo.id.startsWith("local-")))
          throw new Error("Не удалось найти подготовленные фотографии");
      } catch (reason) {
        reportClientError(new Error("QUESTION_ANSWER_PHOTO_SEND_FAILED"), {
          issueKey: "QuestionAnswer", keys: { operation: "photo_send" },
        });
        if (current()) setError(reason instanceof Error ? reason.message :
          "Не удалось загрузить фото. Проверьте интернет и повторите отправку.");
        return;
      }
      if (!current()) return;
      const input = { ...checked.input, photoIds: readyPhotos.map(photo => photo.id) };
      if (editing) {
        await questionsApi.editAnswer(editing.id, {
          body: input.body,
          photoIds: input.photoIds,
        });
      } else {
        await questionsApi.answer(id, { ...input, clientRequestId: requestId });
      }
      if (!current()) return;
      acknowledged = true;
      reset();
      setExtraReplies({});
      try {
        await cache.invalidateQueries({ queryKey: ["questions"] });
      } catch {
        reportClientError(new Error("QUESTION_ANSWER_CACHE_INVALIDATION_FAILED"), {
          issueKey: "QuestionAnswer",
          keys: { operation: "invalidate" },
        });
      }
    } catch {
      if (current()) {
        reportClientError(
          new Error(
            acknowledged ? "QUESTION_ANSWER_POST_ACK_UI_FAILED" : "QUESTION_ANSWER_WRITE_UNKNOWN",
          ),
          {
            issueKey: "QuestionAnswer",
            keys: { operation: acknowledged ? "post_ack" : "submit" },
          },
        );
        if (!acknowledged) {
          unknownAnswerRef.current = true;
          setUnknownAnswer(true);
          setError(
            "Результат отправки ответа неизвестен. Проверьте обсуждение; повторная отправка заблокирована.",
          );
        }
      }
    } finally {
      if (current()) {
        answerSending.current = false;
        setBusy(false);
      }
    }
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
            void run(
              () => (answerId ? questionsApi.removeAnswer(answerId) : questionsApi.remove(id)),
              true,
              true,
              () => {
                if (!answerId && current()) router.replace("/(main)/(tabs)/questions" as Href);
              },
            ),
        },
      ],
    );
  const questionActions: QuestionPostAction[] = [
    {
      key: "share",
      label: "Поделиться",
      icon: "share-variant-outline",
      onPress: () => {
        if (!current()) return;
        void Share.share({ message: `https://gafus.ru/questions/${id}` }).catch(() => {
          if (current()) setError("Не удалось поделиться вопросом");
        });
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
      disabled: busy || actionUnknown || !!question.blockReason,
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
      disabled: busy || actionUnknown,
      destructive: true,
      onPress: () => confirmDelete(),
    });
  }
  const selectedCandidate = answerMenuId ? answersById.get(answerMenuId) : undefined;
  const selectedAnswer =
    selectedCandidate && !selectedCandidate.deleted && !selectedCandidate.hidden
      ? selectedCandidate
      : undefined;
  const answerActions: QuestionPostAction[] = [];
  if (selectedAnswer) {
    if (question?.canManage) {
      answerActions.push({
        key: "best",
        label: selectedAnswer.best ? "Снять лучший ответ" : "Выбрать лучшим",
        icon: selectedAnswer.best ? "star-off-outline" : "star-outline",
        disabled: busy || actionUnknown || !!question.blockReason,
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
        disabled: busy || actionUnknown,
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
  const loadNestedReplies = async (root: QuestionAnswerDto) => {
    const requestedSort = sort;
    const generation = sortGeneration.current;
    const page = extraReplies[root.id]?.nextPage ?? 2;
    if (!current() || sortRef.current !== requestedSort || busy) return;
    const active = nestedReadFlights.current.get(root.id);
    if (active?.sort === requestedSort && active.generation === generation && active.pending)
      return;
    const flight = { sort: requestedSort, generation, page, pending: true };
    nestedReadFlights.current.set(root.id, flight);
    setNestedReadLoading((v) => ({ ...v, [root.id]: flight }));
    setNestedReadErrors((v) => {
      if (!v[root.id]) return v;
      const next = { ...v };
      delete next[root.id];
      return next;
    });
    const isCurrentFlight = () =>
      current() &&
      sortRef.current === requestedSort &&
      sortGeneration.current === generation &&
      nestedReadFlights.current.get(root.id) === flight;
    try {
      const result = await questionsApi.replies(root.id, page);
      if (!isCurrentFlight()) return;
      setExtraReplies((v) =>
        isCurrentFlight()
          ? {
              ...v,
              [root.id]: {
                ...result,
                items: [...(v[root.id]?.items ?? []), ...result.items],
              },
            }
          : v,
      );
    } catch {
      if (isCurrentFlight()) {
        reportClientError(new Error("QUESTION_NESTED_REPLIES_NEXT_PAGE_FAILED"), {
          issueKey: "QuestionDetail",
          keys: { operation: "nested_read" },
        });
        setNestedReadErrors((v) => ({ ...v, [root.id]: flight }));
      }
    } finally {
      if (nestedReadFlights.current.get(root.id) === flight) {
        flight.pending = false;
        if (current() && sortRef.current === requestedSort &&
          sortGeneration.current === generation) {
          setNestedReadLoading((v) => {
            if (v[root.id] !== flight) return v;
            const next = { ...v };
            delete next[root.id];
            return next;
          });
        }
      }
    }
  };
  const threadControls = (root: QuestionAnswerDto) => {
    if (root.parentId || root.replyCount === 0) return null;
    const hidden = collapsed.includes(root.id);
    const loadedReplyCount = loadedReplyCountByRoot.get(root.id) ?? 0;
    const canLoadMore =
      !hidden && extraReplies[root.id]?.nextPage !== null && root.replyCount > loadedReplyCount;
    const loadingState = nestedReadLoading[root.id];
    const errorState = nestedReadErrors[root.id];
    const loadingMore = loadingState?.sort === sort &&
      loadingState.generation === sortGeneration.current;
    const failedMore = errorState?.sort === sort &&
      errorState.generation === sortGeneration.current;
    // The visible author and current displayed root order identify this thread
    // without exposing a server ID or merging same-author action controls.
    const branch = `ветке ${rootAnswers.indexOf(root) + 1} пользователя ${root.author.name}`;
    return (
      <View style={styles.threadControls}>
        {canLoadMore && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={loadingMore
              ? `Загружаем ответы в ${branch}`
              : failedMore
                ? `Повторить загрузку ответов в ${branch}`
                : `Показать ещё ответы в ${branch}`}
            accessibilityState={{ disabled: busy || loadingMore, busy: loadingMore }}
            disabled={busy || loadingMore}
            hitSlop={6}
            style={({ pressed }) => [
              styles.threadAction,
              (busy || loadingMore || pressed) && styles.pressed,
            ]}
            onPress={() => void loadNestedReplies(root)}
          >
            <View style={styles.threadLine} />
            <Text style={styles.threadActionText}
              accessibilityLiveRegion={loadingMore ? "polite" : "none"}
              accessibilityLabel={loadingMore ? `Загружаем ответы в ${branch}` : undefined}>
              {loadingMore ? "Загрузка…" : failedMore ? "Повторить загрузку ответов" : "Смотреть ещё ответы"}
            </Text>
          </Pressable>
        )}
        {failedMore && canLoadMore && (
          <Text accessibilityRole="alert" style={st.error}
            accessibilityLabel={`Не удалось загрузить ответы в ${branch}. Уже загруженные ответы доступны.`}>
            Не удалось загрузить ответы в ветке. Уже загруженные ответы доступны.
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden
            ? `Показать ответы (${root.replyCount}) в ${branch}`
            : `Скрыть ответы в ${branch}`}
          accessibilityState={{ expanded: !hidden }}
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
            {answer.photos.length > 0 && (
              <QPhotos photos={answer.photos} onRetry={()=>{void query.refetch();}} />
            )}
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
            isActorCurrent={current}
            onToggle={(nextLiked) => questionsApi.heart(answer.id, nextLiked)}
            onSuccess={() => cache.invalidateQueries({ queryKey: ["questions"] })}
            onError={(reason) => {
              setError(reason instanceof Error ? reason.message : "Не удалось поставить сердечко");
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
        // Android edge-to-edge also requires padding; relying on resize alone
        // leaves the answer composer behind the on-screen keyboard.
        behavior="padding"
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onLayout={scrollToAnswer}
          onContentSizeChange={scrollToAnswer}
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
          <AppBackButton
            label="Все вопросы"
            onPress={() => router.replace("/(main)/(tabs)/questions" as Href)}
          />
          {query.isPending && <Loading variant="inline" message="Загрузка вопроса…" />}
          {query.isError && !query.isFetchNextPageError && !rootPageFailed && (
            <View style={st.group}>
              <Text accessibilityRole="alert" style={st.error}>
                Не удалось загрузить обсуждение
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
                {question.photos.length > 0 && (
                  <QPhotos photos={question.photos} onRetry={()=>{void query.refetch();}} />
                )}
                <Text style={[st.meta, styles.questionMeta]}>
                  {formatAnswerCount(question.answerCount)} · {question.viewCount} просмотров
                </Text>
                <QuestionPostMenu
                  isActorCurrent={current}
                  visible={postMenuOpen}
                  onClose={() => setPostMenuOpen(false)}
                  actions={questionActions}
                />
              </View>
              {hasPendingPhoto && photoPollOverdue && (
                <View style={st.group}>
                  <Text accessibilityRole="alert" style={st.error}>
                    Обработка фото затянулась. Можно повторно проверить статус, загружать фотографию заново не нужно.
                  </Text>
                  <QButton label="Проверить статус фото" secondary onPress={retryPendingPhoto}/>
                </View>
              )}
              <View style={[st.card, styles.answersCard]}>
                <View style={styles.answersToolbar}>
                  <Text style={styles.answersHeading}>
                    {formatAnswerCount(question.answerCount)}
                  </Text>
                  <View style={styles.answerSortRow} accessibilityRole="radiogroup">
                    {(
                      [
                        ["useful", "Полезные"],
                        ["new", "Новые"],
                      ] as const
                    ).map(([value, label]) => (
                      <Pressable
                        key={value}
                        accessibilityRole="radio"
                        accessibilityLabel={`Сортировать: ${label}`}
                        accessibilityState={{ selected: sort === value, checked: sort === value }}
                        hitSlop={6}
                        onPress={() => {
                          if (sortRef.current !== value) {
                            sortRef.current = value;
                            sortGeneration.current += 1;
                            setRootPageError(null);
                            setNestedReadLoading({});
                            setNestedReadErrors({});
                            setSort(value);
                            setExtraReplies({});
                          }
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
                {answersById.size === 0 && !rootPageFailed && (
                  <Text style={st.meta}>Пока никто не ответил. Поделитесь опытом первым.</Text>
                )}
                {rootAnswers.map((root) => (
                  <View key={root.id}>
                    {card(root)}
                    {!root.parentId &&
                      !collapsed.includes(root.id) &&
                      (childrenByRoot.get(root.id) ?? []).map(card)}
                  </View>
                ))}
                {rootPageFailed && !query.isFetchingNextPage && (
                  <Text accessibilityRole="alert" style={st.error}>
                    Не удалось загрузить следующие ответы. Уже загруженные ответы доступны.
                  </Text>
                )}
                {query.hasNextPage && (
                  <QButton
                    label={
                      query.isFetchingNextPage
                        ? "Загрузка…"
                        : rootPageFailed
                          ? "Повторить страницу ответов"
                          : "Ещё ответы"
                    }
                    secondary
                    disabled={query.isFetchingNextPage}
                    onPress={() => void loadNextRootAnswers()}
                  />
                )}
                {query.isFetchingNextPage && <MascotSpinner />}
              </View>
              <QuestionPostMenu
                isActorCurrent={current}
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
                    disabled={busy || actionUnknown}
                    onPress={() =>
                      void run(
                        () => questionsApi.report(id, { ...reportTarget, reason, details }),
                        true,
                        true,
                        () => {
                          setReportTarget(null);
                          setDetails("");
                          setNotice("Жалоба отправлена администратору");
                        },
                      )
                    }
                  />
                  <QButton label="Отмена" secondary onPress={() => setReportTarget(null)} />
                </View>
              )}
              {(question.canReply || editing) && (
                <View style={[st.card, styles.answerComposer]}>
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
                    onFocus={() => {
                      answerInputFocused.current = true;
                      scrollToAnswer();
                    }}
                    onBlur={() => { answerInputFocused.current = false; }}
                    multiline
                    minHeight={84}
                    maxLength={QUESTION_LIMITS.body}
                    placeholder="Поделитесь своим опытом"
                  />
                  <QPhotoPicker
                    photos={photos}
                    onChange={setPhotos}
                    onBusy={setUploading}
                    submitUploadsRef={photoSubmitRef}
                    compact
                    trailingAction={
                      <QButton
                        label={busy ? "Отправка…" : editing ? "Сохранить" : "Ответить"}
                        compact
                        disabled={busy || uploading || unknownAnswer || !body.trim()}
                        onPress={() => void submitAnswer()}
                      />
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
  answerComposer: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
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
