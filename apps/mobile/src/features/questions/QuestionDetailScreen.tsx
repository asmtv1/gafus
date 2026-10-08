import { useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
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
import { questionsApi } from "@/shared/lib/api/questions";
import { QAuthor, QBody, QButton, QInput, QPhotoPicker, QPhotos, QStatus, st } from "./ui";
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
                router.replace("/questions" as Href);
              }
            }),
        },
      ],
    );
  const card = (answer: QuestionAnswerDto) => (
    <View
      key={answer.id}
      style={[st.answer, answer.parentId && !answer.best && st.reply, answer.best && st.best]}
    >
      {answer.best && <Text style={[st.badge, st.resolved]}>Лучший ответ</Text>}
      <QAuthor author={answer.author} date={answer.createdAt} edited={answer.editedAt} />
      {answer.replyToName && <Text style={st.meta}>В ответ {answer.replyToName}</Text>}
      <QBody text={answer.body} />
      <QPhotos photos={answer.photos} />
      {!answer.deleted && !answer.hidden && (
        <View style={st.row}>
          <QButton
            label={`${answer.hearts} сердечек`}
            icon={answer.liked ? "heart" : "heart-outline"}
            selected={answer.liked}
            secondary
            disabled={busy || answer.author.id === userId || !!question?.blockReason}
            onPress={() => void run(() => questionsApi.heart(answer.id, !answer.liked))}
          />
          {question?.canReply && (
            <QButton
              label="Ответить"
              secondary
              onPress={() => {
                reset();
                setReplyTo(answer);
                scroll.current?.scrollToEnd({ animated: true });
              }}
            />
          )}
          {question?.canManage && (
            <QButton
              label={answer.best ? "Снять лучший ответ" : "Выбрать лучшим"}
              secondary
              disabled={busy || !!question.blockReason}
              onPress={() => void run(() => questionsApi.best(id, answer.best ? null : answer.id))}
            />
          )}
          {answer.canEdit && !question?.blockReason && (
            <QButton
              label="Изменить"
              secondary
              onPress={() => {
                reset();
                setEditing(answer);
                setBody(answer.body);
                setPhotos(answer.photos);
                scroll.current?.scrollToEnd({ animated: true });
              }}
            />
          )}
          {answer.canDelete && (
            <QButton
              label="Удалить"
              secondary
              disabled={busy}
              onPress={() => confirmDelete(answer.id)}
            />
          )}
          {!question?.blockReason && (
            <QButton
              label="Жалоба"
              secondary
              icon="flag-outline"
              onPress={() => {
                setReportTarget({ answerId: answer.id });
                scroll.current?.scrollToEnd({ animated: true });
              }}
            />
          )}
        </View>
      )}
      {!answer.parentId && answer.replyCount > 0 && (
        <QButton
          label={collapsed.includes(answer.id) ? "Показать ответы" : "Скрыть ответы"}
          secondary
          onPress={() =>
            setCollapsed((v) =>
              v.includes(answer.id) ? v.filter((x) => x !== answer.id) : [...v, answer.id],
            )
          }
        />
      )}
      {!answer.parentId &&
        !collapsed.includes(answer.id) &&
        extraReplies[answer.id]?.nextPage !== null &&
        answer.replyCount > answers.filter((a) => a.parentId === answer.id).length && (
          <QButton
            label="Ещё ответы в ветке"
            secondary
            disabled={busy}
            onPress={() =>
              void run(async () => {
                const page = await questionsApi.replies(
                  answer.id,
                  extraReplies[answer.id]?.nextPage ?? 2,
                );
                setExtraReplies((v) => ({
                  ...v,
                  [answer.id]: { ...page, items: [...(v[answer.id]?.items ?? []), ...page.items] },
                }));
              }, false)
            }
          />
        )}
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
          contentContainerStyle={st.content}
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
            onPress={() => router.replace("/questions" as Href)}
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
              <View style={st.card}>
                <QAuthor
                  author={question.author}
                  date={question.createdAt}
                  edited={question.editedAt}
                />
                <Text style={st.title}>{question.title}</Text>
                <QStatus question={question} />
                <QBody text={question.body} />
                <QPhotos photos={question.photos} />
                <Text style={st.meta}>
                  {question.answerCount} ответов · {question.viewCount} просмотров
                </Text>
                <View style={st.row}>
                  {question.canReply && (
                    <QButton
                      label="Ответить"
                      onPress={() => scroll.current?.scrollToEnd({ animated: true })}
                    />
                  )}
                  <QButton
                    label="Поделиться"
                    secondary
                    icon="share-variant-outline"
                    onPress={() =>
                      void Share.share({ message: `https://gafus.ru/questions/${id}` }).catch(() =>
                        setError("Не удалось поделиться вопросом"),
                      )
                    }
                  />
                  {!question.blockReason && (
                    <QButton
                      label="Жалоба"
                      secondary
                      icon="flag-outline"
                      onPress={() => {
                        setReportTarget({});
                        scroll.current?.scrollToEnd({ animated: true });
                      }}
                    />
                  )}
                  {question.canManage && (
                    <QButton
                      label={question.closed ? "Открыть обсуждение" : "Закрыть обсуждение"}
                      secondary
                      icon="lock-outline"
                      disabled={busy || !!question.blockReason}
                      onPress={() => void run(() => questionsApi.close(id, !question.closed))}
                    />
                  )}
                  {question.canEdit && !question.blockReason && (
                    <QButton
                      label="Изменить"
                      secondary
                      onPress={() => router.push(`/questions/${id}/edit` as Href)}
                    />
                  )}
                  {question.canManage && (
                    <QButton
                      label="Удалить"
                      secondary
                      disabled={busy}
                      onPress={() => confirmDelete()}
                    />
                  )}
                </View>
              </View>
              <View style={st.card}>
                <Text style={st.title}>{question.answerCount} ответов</Text>
                <View style={st.row}>
                  <QButton
                    label="Полезные"
                    secondary
                    selected={sort === "useful"}
                    onPress={() => {
                      setSort("useful");
                      setExtraReplies({});
                    }}
                  />
                  <QButton
                    label="Новые"
                    secondary
                    selected={sort === "new"}
                    onPress={() => {
                      setSort("new");
                      setExtraReplies({});
                    }}
                  />
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
