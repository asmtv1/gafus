import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { Button } from "@/shared/components";
import { COLORS, FONTS } from "@/shared/config";
import { feedApi } from "@/shared/lib/api/feed";

function votesLabel(count: number) {
  const remainder = count % 100;
  const ending = remainder > 10 && remainder < 20 ? 5 : count % 10;
  return `${count} ${ending === 1 ? "голос" : ending >= 2 && ending <= 4 ? "голоса" : "голосов"}`;
}

export function FeedPollCard({ postId }: { postId: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  const poll = useQuery({
    queryKey: ["feed", "poll", postId],
    queryFn: () => feedApi.getPoll(postId),
    staleTime: 20_000,
    retry: false,
  });
  const value = poll.data;
  const toggle = (id: string) => {
    if (!value || value.closed || value.myOptionIds.length) return;
    setSelected(ids => value.allowMultiple
      ? ids.includes(id) ? ids.filter(key => key !== id) : [...ids, id]
      : [id]);
  };
  const vote = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      await feedApi.votePoll(postId, { optionIds: selected });
      setSelected([]);
    } catch (error) {
      Alert.alert("Опрос", error instanceof Error ? error.message : "Не удалось проголосовать");
    } finally {
      await cache.invalidateQueries({ queryKey: ["feed", "poll", postId] });
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
          <Text style={s.question}>{value.question}</Text>
          <Text style={s.muted}>
            {value.isQuiz ? "Викторина" : "Опрос"} ·{" "}
            {value.allowMultiple ? "Несколько ответов" : "Один ответ"}
            {value.isAnonymous ? " · Анонимно" : ""}
          </Text>
          <View style={s.options}>
            {value.options.map(option => {
              const checked = selected.includes(option.id) || value.myOptionIds.includes(option.id);
              const percent = value.totalVotes && option.votes !== null
                ? Math.round(option.votes / value.totalVotes * 100)
                : 0;
              const hasResults = option.votes !== null;
              const disabled = value.closed || value.myOptionIds.length > 0 || busy;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={hasResults ? `${option.text}, ${percent}%` : option.text}
                  accessibilityState={{ selected: checked, disabled }}
                  disabled={disabled}
                  style={[s.choice, checked && s.selected]}
                  onPress={() => toggle(option.id)}
                >
                  {hasResults && (
                    <View
                      pointerEvents="none"
                      accessible={false}
                      style={[s.resultFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]}
                    />
                  )}
                  <View style={s.choiceLine}>
                    <Text style={s.mark}>{checked ? "●" : "○"}</Text>
                    {option.imageUrl && option.imageMediaId && (
                      <CdnImage
                        cdnUrl={option.imageUrl}
                        requestFallback={() => feedApi.requestMediaFallback(option.imageMediaId!, "thumb")}
                        contentFit="cover"
                        style={s.photo}
                      />
                    )}
                    <Text style={s.choiceText}>
                      {option.text}{option.isCorrect === true ? " ✓" : ""}
                    </Text>
                    {hasResults && <Text style={s.count}>{percent}%</Text>}
                  </View>
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
              disabled={busy || !selected.length}
              onPress={() => void vote()}
            />
          )}
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
