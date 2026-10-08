import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { QUESTION_CATEGORIES, type QuestionStatus, type QuestionSort } from "@gafus/types";
import { TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { questionsApi } from "@/shared/lib/api/questions";
import { QAuthor, QButton, QStatus, QInput, st } from "./ui";
export function QuestionsScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<QuestionStatus | "">("");
  const [sort, setSort] = useState<QuestionSort>("new");
  const [mine, setMine] = useState(false);
  const [filters, setFilters] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useInfiniteQuery({
    queryKey: ["questions", userId, { term, category, status, sort, mine }],
    queryFn: ({ pageParam }) =>
      questionsApi.list({
        search: term,
        category: category || undefined,
        status,
        sort,
        mine,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (p) => p.nextPage,
    enabled: !!userId,
  });
  const access = query.data?.pages[0];
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <TexturedSafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={st.content}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backRow}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backText}>Назад</Text>
        </Pressable>
        <View style={styles.header} accessible accessibilityRole="header">
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Вопросы</Text>
            <Text style={styles.headerDescription}>
              Спрашивайте и делитесь опытом с другими владельцами
            </Text>
          </View>
          <Image
            source={require("../../../assets/images/tab-icons/questions.png")}
            style={styles.headerArtwork}
            contentFit="contain"
            accessible={false}
          />
        </View>
        <QButton
          label="Задать вопрос"
          icon="plus"
          disabled={access?.canPublish === false}
          onPress={() => router.push("/questions/new" as Href)}
        />
        {access?.blockReason && (
          <Text style={st.notice}>
            Публикации заблокированы: {access.blockReason}. Вы можете читать обсуждения.
          </Text>
        )}
        <QInput
          label="Поиск вопросов"
          value={search}
          onChange={setSearch}
          placeholder="Что вас интересует?"
          maxLength={150}
        />
        <View style={st.row}>
          <QButton label="Все" secondary selected={!mine} onPress={() => setMine(false)} />
          <QButton label="Мои" secondary selected={mine} onPress={() => setMine(true)} />
          <QButton
            label={filters ? "Скрыть фильтры" : "Фильтры"}
            secondary
            icon="filter-variant"
            onPress={() => setFilters(!filters)}
          />
        </View>
        <View style={st.row}>
          {(
            [
              ["new", "Новые"],
              ["active", "Активные"],
              ["unanswered", "Без ответа"],
            ] as const
          ).map(([v, text]) => (
            <QButton
              key={v}
              label={text}
              secondary
              selected={sort === v}
              onPress={() => setSort(v)}
            />
          ))}
        </View>
        {filters && (
          <View style={st.card}>
            <Text style={st.label}>Категория</Text>
            <View style={st.row}>
              {["", ...QUESTION_CATEGORIES].map((c) => (
                <QButton
                  key={c}
                  label={c || "Все категории"}
                  secondary
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
            <Text style={st.label}>Статус</Text>
            <View style={st.row}>
              {(
                [
                  ["", "Все"],
                  ["waiting", "Ждёт ответа"],
                  ["answered", "Есть ответы"],
                  ["resolved", "Решён"],
                ] as const
              ).map(([v, text]) => (
                <QButton
                  key={v}
                  label={text}
                  secondary
                  selected={status === v}
                  onPress={() => setStatus(v)}
                />
              ))}
            </View>
          </View>
        )}
        {query.isPending && <Text style={st.meta}>Загрузка вопросов…</Text>}
        {query.isError && (
          <View style={st.group}>
            <Text accessibilityRole="alert" style={st.error}>
              {query.error.message}
            </Text>
            <QButton label="Повторить" secondary onPress={() => void query.refetch()} />
          </View>
        )}
        {!query.isPending && !query.isError && !items.length && (
          <View style={st.card}>
            <Text style={st.title}>Вопросов пока нет</Text>
            <Text style={st.body}>
              Измените фильтры или задайте свой вопрос — другие владельцы смогут поделиться опытом.
            </Text>
          </View>
        )}
        {items.map((q) => (
          <Pressable
            key={q.id}
            accessibilityRole="button"
            accessibilityLabel={q.title}
            onPress={() => router.push(`/questions/${q.id}` as Href)}
            style={({ pressed }) => [st.card, pressed && { opacity: 0.7 }]}
          >
            <QStatus question={q} />
            <Text style={st.title}>{q.title}</Text>
            {q.bestAnswer && (
              <View style={[st.notice, { backgroundColor: "#e3ead7" }]}>
                <Text style={st.label}>Лучший ответ</Text>
                <Text style={st.body} numberOfLines={3}>
                  {q.bestAnswer.body}
                </Text>
              </View>
            )}
            <QAuthor author={q.author} date={q.createdAt} />
            <Text style={st.meta}>
              {q.answerCount} ответов · {q.viewCount} просмотров
            </Text>
          </Pressable>
        ))}
        {query.hasNextPage && (
          <QButton
            label={query.isFetchingNextPage ? "Загрузка…" : "Ещё вопросы"}
            secondary
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          />
        )}
      </ScrollView>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  backRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    gap: 4,
  },
  backText: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 17,
    color: COLORS.primary,
  },
  header: {
    minHeight: 150,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  headerCopy: { flex: 1, paddingRight: SPACING.sm },
  headerTitle: {
    fontFamily: FONTS.impact,
    fontSize: 36,
    lineHeight: 44,
    color: COLORS.text,
  },
  headerDescription: {
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  headerArtwork: { width: 104, height: 104 },
});
