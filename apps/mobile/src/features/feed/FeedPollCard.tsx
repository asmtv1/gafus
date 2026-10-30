import { useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { Button } from "@/shared/components";
import { COLORS, FONTS } from "@/shared/config";
import { feedApi } from "@/shared/lib/api/feed";
import { reportClientError } from "@/shared/lib/tracer";

function votesLabel(count: number) {
  const remainder = count % 100;
  const ending = remainder > 10 && remainder < 20 ? 5 : count % 10;
  return `${count} ${ending === 1 ? "голос" : ending >= 2 && ending <= 4 ? "голоса" : "голосов"}`;
}

export function FeedPollCard({ postId }: { postId: string }) {
  return <FeedPollTarget key={postId} postId={postId} />;
}

function sameOptions(actual: string[], expected: string[]) {
  return actual.length === expected.length && expected.every(id => actual.includes(id));
}

function FeedPollTarget({ postId }: { postId: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [busy, setBusy] = useState(false);
  // Native onPress can run twice before React paints the pending state.
  const voteFlight = useRef(false);
  const acceptedVote = useRef(false);
  const cache = useQueryClient();
  const poll = useQuery({
    queryKey: ["feed", "poll", postId],
    queryFn: () => feedApi.getPoll(postId),
    staleTime: 20_000,
    retry: false,
  });
  const value = poll.data;
  const hasVoted = !!value?.myOptionIds.length;
  const validCurrent = !!value && value.myOptionIds.every(id =>
    value.options.some(option => option.id === id));
  const mutable = !!value && !value.closed && !value.isQuiz && hasVoted && validCurrent;
  const locked = busy || voteFlight.current || needsCheck || poll.isFetching || poll.isError;
  const toggle = (id: string) => {
    if (!value || value.closed || locked ||
      (hasVoted && (!editing || !mutable)) ||
      (!hasVoted && acceptedVote.current) ||
      !value.options.some(option => option.id === id)) return;
    setSelected(ids => value.allowMultiple
      ? ids.includes(id) ? ids.filter(key => key !== id) : [...ids, id]
      : [id]);
  };
  const vote = async () => {
    // Check current server vote status/option readiness at handler time,
    // not only through the button's disabled prop or the next React render.
    if (!value || poll.isPending || poll.isError || poll.isFetching ||
      value.closed || value.myOptionIds.length > 0 || acceptedVote.current ||
      !selected.length || busy || voteFlight.current || needsCheck ||
      (!value.allowMultiple && selected.length !== 1) ||
      selected.some(id => !value.options.some(option => option.id === id))) return;
    voteFlight.current = true;
    setBusy(true);
    let acknowledged = false;
    try {
      await feedApi.votePoll(postId, { optionIds: [...selected] });
      acknowledged = true;
      acceptedVote.current = true;
      setSelected([]);
    } catch {
      reportClientError(new Error("FEED_POLL_VOTE_RESULT_UNCONFIRMED"), {
        issueKey: "FeedPollCard",
        keys: { operation: "vote_poll" },
      });
      Alert.alert("Опрос", "Не удалось проголосовать. Проверьте состояние опроса перед повторной попыткой.");
    } finally {
      try {
        // Preserve the existing refresh even after an unknown write result.
        await cache.invalidateQueries({ queryKey: ["feed", "poll", postId] });
      } catch {
        reportClientError(new Error("FEED_POLL_CACHE_REFRESH_FAILED"), {
          issueKey: "FeedPollCard",
          keys: { operation: "vote_poll_refresh" },
        });
        if (acknowledged) {
          Alert.alert("Опрос", "Голос принят. Не удалось обновить результаты опроса.");
        }
      } finally {
        voteFlight.current = false;
        setBusy(false);
      }
    }
  };

  const startEdit = () => {
    if (!mutable || locked || !value) return;
    setSelected([...value.myOptionIds]);
    setEditing(true);
  };
  const cancelEdit = () => {
    if (locked) return;
    setEditing(false);
    setSelected([]);
  };
  const updateVote = async (kind: "change" | "cancel") => {
    // Ref must be read NOW: `locked` was computed on the preceding render.
    if (!mutable || locked || voteFlight.current || !value ||
      poll.isPending || !validCurrent) return;
    const choice = [...selected];
    if (kind === "change" && (!editing || !choice.length ||
      (!value.allowMultiple && choice.length !== 1) ||
      new Set(choice).size !== choice.length ||
      choice.some(id => !value.options.some(option => option.id === id)) ||
      sameOptions(choice, value.myOptionIds))) return;
    voteFlight.current = true;
    setBusy(true);
    try {
      // A write ACK is necessary but not enough to change the visible vote.
      const ack = kind === "change"
        ? await feedApi.changePollVote(postId, { optionIds: choice })
        : await feedApi.cancelPollVote(postId);
      const expected = kind === "change" ? choice : [];
      if (!ack || !Array.isArray(ack.myOptionIds) ||
        !sameOptions(ack.myOptionIds, expected))
        throw new Error("FEED_POLL_WRITE_ACK_UNCONFIRMED");
      const fresh = await feedApi.getPoll(postId);
      if (!fresh || !Array.isArray(fresh.myOptionIds) ||
        !sameOptions(fresh.myOptionIds, expected))
        throw new Error("FEED_POLL_FRESH_READ_UNCONFIRMED");
      // No optimistic counters or selection: take all values from fresh GET.
      cache.setQueryData(["feed", "poll", postId], fresh);
      acceptedVote.current = fresh.myOptionIds.length > 0;
      setSelected([]);
      setEditing(false);
      setNeedsCheck(false);
    } catch {
      // Outcome may be committed, so only a deliberate GET can unblock writes.
      setNeedsCheck(true);
      reportClientError(new Error("FEED_POLL_CHANGE_CANCEL_RESULT_UNCONFIRMED"), {
        issueKey: "FeedPollCard", keys: { operation: kind === "change" ? "change_poll" : "cancel_poll" },
      });
      Alert.alert("Опрос", "Не удалось подтвердить результат. Проверьте состояние голоса перед повторным действием.");
    } finally {
      voteFlight.current = false;
      setBusy(false);
    }
  };
  const checkVote = async () => {
    if (!needsCheck || busy || voteFlight.current || poll.isFetching) return;
    voteFlight.current = true;
    setBusy(true);
    try {
      const fresh = await feedApi.getPoll(postId);
      if (!fresh || !Array.isArray(fresh.myOptionIds))
        throw new Error("FEED_POLL_MANUAL_GET_UNCONFIRMED");
      cache.setQueryData(["feed", "poll", postId], fresh);
      acceptedVote.current = fresh.myOptionIds.length > 0;
      setSelected([]);
      setEditing(false);
      setNeedsCheck(false);
    } catch {
      reportClientError(new Error("FEED_POLL_MANUAL_GET_FAILED"), {
        issueKey: "FeedPollCard", keys: { operation: "check_poll_vote" },
      });
      Alert.alert("Опрос", "Не удалось проверить состояние голоса. Повторите проверку позже.");
    } finally {
      voteFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={s.poll} accessibilityLabel="Опрос">
      {poll.isError ? (
        <Button
          label="Повторить загрузку опроса"
          variant="secondary"
          onPress={() => void poll.refetch()}
        />
      ) : !value ? (
        <Text style={s.muted}>Загружаем опрос…</Text>
      ) : (
        <>
          <Text style={s.question} accessibilityRole="header">{value.question}</Text>
          <Text style={s.muted}>
            {value.isQuiz ? "Викторина" : "Опрос"} ·{" "}
            {value.allowMultiple ? "Несколько ответов" : "Один ответ"}
            {value.isAnonymous ? " · Анонимно" : ""}
          </Text>
          <View style={s.options}
            accessibilityRole={value.closed || (hasVoted && !editing) || value.allowMultiple
              ? "list" : "radiogroup"}
            accessibilityLabel={`Варианты ответа на вопрос «${value.question}». ${
              value.allowMultiple ? "Можно выбрать несколько вариантов" : "Выберите один вариант"
            }`}>
            {value.options.map(option => {
              const checked = hasVoted
                ? editing && !busy && !needsCheck
                  ? selected.includes(option.id) : value.myOptionIds.includes(option.id)
                : selected.includes(option.id);
              const percent = value.totalVotes && option.votes !== null
                ? Math.round(option.votes / value.totalVotes * 100)
                : 0;
              // No percentage must leak when the server hides totals, even
              // if an inconsistent option happens to contain a vote count.
              const hasResults = option.votes !== null &&
                (value.isQuiz || value.totalVotes !== null);
              const disabled = value.closed || locked ||
                (hasVoted ? !mutable || !editing : acceptedVote.current);
              const readOnly = value.closed || (hasVoted && !editing);
              const optionLabel = [option.text, hasResults ? `${percent}%` : null,
                readOnly && value.myOptionIds.includes(option.id) ? "Ваш выбор" : null,
                value.isQuiz && option.isCorrect === true ? "Правильный ответ" : null,
              ].filter(Boolean).join(", ");
              const content = <>
                {hasResults && (
                  <View pointerEvents="none" accessible={false}
                    style={[s.resultFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]} />
                )}
                <View style={s.choiceLine}>
                  <Text style={s.mark} accessible={false}>
                    {checked ? "●" : "○"}
                  </Text>
                  {option.imageUrl && option.imageMediaId && (
                    <CdnImage
                      cdnUrl={option.imageUrl}
                      requestFallback={() => feedApi.requestMediaFallback(option.imageMediaId!, "thumb")}
                      contentFit="cover"
                      style={s.photo}
                    />
                  )}
                  <Text style={s.choiceText} accessible={false}>
                    {option.text}{option.isCorrect === true ? " ✓" : ""}
                  </Text>
                  {hasResults && (
                    <Text style={s.count} accessible={false}>
                      {percent}%
                    </Text>
                  )}
                </View>
              </>;
              return readOnly ? (
                <View key={option.id} accessible accessibilityRole="text"
                  accessibilityLabel={optionLabel} style={[s.choice, checked && s.selected]}>
                  {content}
                </View>
              ) : (
                <Pressable key={option.id}
                  accessibilityRole={value.allowMultiple ? "checkbox" : "radio"}
                  accessibilityLabel={optionLabel}
                  accessibilityState={{ checked, disabled }}
                  disabled={disabled} style={[s.choice, checked && s.selected]}
                  onPress={() => toggle(option.id)}>
                  {content}
                </Pressable>
              );
            })}
          </View>
          <Text style={s.muted}>
            {value.totalVotes === null ? "Результаты скрыты" : votesLabel(value.totalVotes)}
            {value.closed
              ? " · Завершён"
              : value.endDate
                ? ` · До ${new Date(value.endDate).toLocaleDateString("ru-RU")}`
                : ""}
          </Text>
          {!value.closed && !value.myOptionIds.length && (
            <Button
              variant="primary"
              label={busy ? "Отправляем…" : "Проголосовать"}
              disabled={locked || acceptedVote.current || !selected.length}
              onPress={() => void vote()}
            />
          )}
          {mutable && (
            <>
              {!editing ? (
                <Button label="Изменить ответ" variant="secondary"
                  disabled={locked} onPress={startEdit} />
              ) : (
                <>
                  <Button label="Сохранить изменения" variant="primary"
                    disabled={locked || !selected.length ||
                      (!value.allowMultiple && selected.length !== 1) ||
                      sameOptions(selected, value.myOptionIds)}
                    onPress={() => void updateVote("change")} />
                  <Button label="Отменить изменения" variant="secondary"
                    disabled={locked} onPress={cancelEdit} />
                </>
              )}
              <Button label="Отменить голос" variant="secondary"
                disabled={locked} onPress={() => void updateVote("cancel")} />
            </>
          )}
          {(busy || needsCheck) && <Text style={s.muted} accessibilityLiveRegion="polite">
            {busy && needsCheck ? "Проверяем состояние голоса…" :
              busy ? "Сохраняем голос…" :
                "Результат не подтверждён. Проверьте состояние голоса перед новым действием."}
          </Text>}
          {needsCheck && <Button label="Проверить состояние голоса" variant="secondary"
            disabled={busy || voteFlight.current || poll.isFetching}
            onPress={() => void checkVote()} />}
          {value.explanation && <Text style={s.muted}>{value.explanation}</Text>}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  poll: {
    backgroundColor: "#F5F7EF",
    padding: 11,
    borderWidth: 1,
    borderColor: "#E0E7DB",
    borderRadius: 14,
    gap: 6,
  },
  question: { color: COLORS.text, fontFamily: FONTS.montserratBold, fontSize: 15, lineHeight: 21 },
  muted: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    fontSize: 11,
    lineHeight: 16,
  },
  options: { gap: 6 },
  choice: {
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FEFFFB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DCE4D4",
    overflow: "hidden",
    justifyContent: "center",
  },
  selected: { backgroundColor: "#EAF1DF", borderColor: COLORS.primary },
  resultFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#DCE9D0",
  },
  choiceLine: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 },
  mark: { color: COLORS.primary, fontSize: 16, lineHeight: 20 },
  choiceText: {
    flex: 1,
    minWidth: 0,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    lineHeight: 18,
  },
  count: { color: COLORS.primaryDark, fontFamily: FONTS.montserratMedium, fontSize: 12 },
  photo: { width: 44, height: 44, borderRadius: 8 },
});
