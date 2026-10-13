import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { Button } from "@/shared/components";
import { COLORS, FONTS } from "@/shared/config";
import { feedApi } from "@/shared/lib/api/feed";

export function FeedPollCard({ postId }: { postId: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  const poll = useQuery({ queryKey: ["feed", "poll", postId], queryFn: () => feedApi.getPoll(postId),
    staleTime: 20_000, retry: false });
  const value = poll.data;
  const toggle = (id: string) => {
    if (!value || value.closed || value.myOptionIds.length) return;
    setSelected(ids => value.allowMultiple ?
      ids.includes(id) ? ids.filter(key => key !== id) : [...ids, id] : [id]);
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
  return <View style={s.poll} accessibilityLabel="Опрос">
    {poll.isError ? <Button label="Повторить загрузку опроса" variant="secondary"
      onPress={() => void poll.refetch()} /> : !value ?
      <Text style={s.muted}>Загружаем опрос…</Text> : <>
        <Text style={s.question}>{value.question}</Text>
        <Text style={s.muted}>{value.isQuiz ? "Викторина" : "Опрос"} · {value.allowMultiple ? "Несколько ответов" : "Один ответ"}
          {value.isAnonymous ? " · Анонимно" : ""}</Text>
        {value.options.map(option => {
          const checked = selected.includes(option.id) || value.myOptionIds.includes(option.id);
          const percent = value.totalVotes && option.votes !== null ? Math.round(option.votes / value.totalVotes * 100) : 0;
          return <Pressable key={option.id} accessibilityRole="button"
            accessibilityState={{ selected: checked, disabled: value.closed || value.myOptionIds.length > 0 || busy }}
            disabled={value.closed || value.myOptionIds.length > 0 || busy}
            style={[s.choice, checked && s.selected]} onPress={() => toggle(option.id)}>
            <View style={s.choiceLine}>
              <Text style={s.mark}>{checked ? "●" : "○"}</Text>
              <Text style={s.choiceText}>{option.text}{option.isCorrect === true ? " ✓" : ""}</Text>
              {option.votes !== null && <Text style={s.count}>{percent}%</Text>}
            </View>
            {option.imageUrl && option.imageMediaId && <CdnImage cdnUrl={option.imageUrl}
              requestFallback={() => feedApi.requestMediaFallback(option.imageMediaId!, "thumb")}
              contentFit="cover" style={s.photo} />}
            {option.votes !== null && <View style={s.progress}>
              <View style={[s.fill, { width: `${percent}%` }]} />
            </View>}
          </Pressable>;
        })}
        <Text style={s.muted}>{value.totalVotes === null ? "Результаты скрыты" : `${value.totalVotes} голосов`}
          {value.closed ? " · Завершён" : value.endDate ? ` · До ${new Date(value.endDate).toLocaleDateString("ru-RU")}` : ""}</Text>
        {!value.closed && !value.myOptionIds.length && <Button variant="primary"
          label={busy ? "Отправляем…" : "Проголосовать"} disabled={busy || !selected.length}
          onPress={() => void vote()} />}
        {value.explanation && <Text style={s.muted}>{value.explanation}</Text>}
      </>}
  </View>;
}
const s = StyleSheet.create({
  poll: { backgroundColor: "#F5F7EF", padding: 14, borderWidth: 1, borderColor: "#DEE5D7", borderRadius: 15, gap: 9 },
  question: { color: COLORS.text, fontFamily: FONTS.montserratBold, fontSize: 15, lineHeight: 22 },
  muted: { color: COLORS.textSecondary, fontFamily: FONTS.montserrat, fontSize: 11, lineHeight: 17 },
  choice: { backgroundColor: "#FFFEFB", padding: 11, borderRadius: 12, borderWidth: 1, borderColor: "#D7DDCE", gap: 7 },
  selected: { backgroundColor: "#E9F0DC", borderColor: COLORS.primary },
  choiceLine: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 },
  mark: { color: COLORS.primary, fontSize: 18 },
  choiceText: { flex: 1, color: COLORS.text, fontFamily: FONTS.montserrat, fontSize: 13, lineHeight: 19 },
  count: { color: COLORS.primary, fontFamily: FONTS.montserratMedium, fontSize: 12 },
  photo: { width: 100, height: 80, borderRadius: 10, marginLeft: 25 },
  progress: { height: 5, backgroundColor: "#E5E8DF", borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#93A87B", borderRadius: 4 },
});
