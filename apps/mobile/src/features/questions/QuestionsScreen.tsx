import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QUESTION_CATEGORIES, type QuestionStatus, type QuestionSort } from "@gafus/types";
import { Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui/Button";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { questionsApi } from "@/shared/lib/api/questions";
import { QAuthor, QButton, QStatus, st } from "./ui";
function countWord(count: number, forms: [string, string, string]) {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  const last = count % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}
export function QuestionsScreen() {
  const owner = useAuthStore((state) =>
    state.isAuthenticated && !state.isLoading ? (state.user?.id ?? null) : null,
  );
  const verified = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && verified?.principalId === owner ? verified.authEpoch : null;
  if (!owner || !epoch) {
    return (
      <TexturedSafeAreaView style={{ flex: 1 }}>
        <Text style={st.error}>Для просмотра вопросов войдите в аккаунт</Text>
      </TexturedSafeAreaView>
    );
  }
  return <QuestionsActorScreen key={`${owner}:${epoch}`} owner={owner} epoch={epoch} />;
}

function QuestionsActorScreen({ owner, epoch }: { owner: string; epoch: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mounted = useRef(true);
  const refreshingRef = useRef(false);
  const paginationRef = useRef(false);
  const isCurrent = () => {
    const auth = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      auth.isAuthenticated &&
      !auth.isLoading &&
      auth.user?.id === owner &&
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
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<QuestionStatus | "">("");
  const [sort, setSort] = useState<QuestionSort>("new");
  const [mine, setMine] = useState(false);
  const [filters, setFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useInfiniteQuery({
    queryKey: ["questions", owner, epoch, { term, category, status, sort, mine }],
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
    enabled: true,
  });
  const refresh = async () => {
    if (refreshingRef.current || !isCurrent()) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await query.refetch();
    } catch {
      if (isCurrent())
        reportClientError(new Error("QUESTION_LIST_REFRESH_FAILED"), {
          issueKey: "QuestionsList",
          keys: { operation: "refresh" },
        });
    } finally {
      refreshingRef.current = false;
      if (isCurrent()) setRefreshing(false);
    }
  };
  const loadMore = async () => {
    if (paginationRef.current || query.isFetchingNextPage || !query.hasNextPage || !isCurrent())
      return;
    paginationRef.current = true;
    try {
      await query.fetchNextPage();
    } catch {
      if (isCurrent())
        reportClientError(new Error("QUESTION_LIST_PAGINATION_FAILED"), {
          issueKey: "QuestionsList",
          keys: { operation: "next_page" },
        });
    } finally {
      paginationRef.current = false;
    }
  };
  const access = query.data?.pages[0];
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const activeFilterCount = Number(!!category) + Number(!!status) + Number(sort !== "new");
  const sortLabel = sort === "new" ? "Новые" : sort === "active" ? "Активные" : "Без ответа";
  const openFilters = () => {
    Keyboard.dismiss();
    setFilters(true);
  };
  return (
    <TexturedSafeAreaView style={{ flex: 1 }} edges={[]}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={st.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <Image
          source={require("../../../assets/images/questions-header.webp")}
          style={styles.headerImage}
          contentFit="cover"
          contentPosition="center"
          accessible
          accessibilityLabel="Вопросы. Задавайте вопросы и получайте помощь от нашей команды и сообщества"
        />
        <Button
          label="Задать вопрос"
          variant="primary"
          icon="plus"
          animatedPress
          disabled={!access || query.isPending || query.isError || access.canPublish === false}
          onPress={() => {
            if (isCurrent() && access?.canPublish) router.push("/questions/new" as Href);
          }}
        />
        {access?.blockReason && (
          <Text style={st.notice}>
            Публикации заблокированы: {access.blockReason}. Вы можете читать обсуждения.
          </Text>
        )}
        <View style={styles.searchSection}>
          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textSecondary} />
              <TextInput
                accessibilityLabel="Поиск вопросов"
                accessibilityHint="Введите слова для поиска по вопросам"
                placeholder="Поиск вопросов"
                placeholderTextColor={COLORS.textSecondary}
                value={search}
                onChangeText={setSearch}
                maxLength={150}
                returnKeyType="search"
                style={styles.searchInput}
              />
              {search.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Очистить поиск"
                  hitSlop={8}
                  onPress={() => setSearch("")}
                >
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={19}
                    color={COLORS.textSecondary}
                  />
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Фильтры вопросов"
              accessibilityState={{ expanded: filters }}
              accessibilityHint={activeFilterCount ? "Есть выбранные фильтры" : "Открыть фильтры"}
              onPress={openFilters}
              style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="tune-variant" size={20} color={COLORS.primary} />
              <Text style={styles.filterButtonText}>Фильтры</Text>
              {activeFilterCount > 0 && <View style={styles.filterDot} />}
            </Pressable>
          </View>
          <View style={styles.scopeRow}>
            <View style={styles.scopeSwitch}>
              {([false, true] as const).map((onlyMine) => (
                <Button
                  key={String(onlyMine)}
                  label={onlyMine ? "Мои" : "Все"}
                  variant={mine === onlyMine ? "primary" : "outline"}
                  accessibilityState={{ selected: mine === onlyMine }}
                  onPress={() => setMine(onlyMine)}
                  fullWidth={false}
                  width={88}
                  height={38}
                  fontSize={13}
                  lineHeight={18}
                  horizontalPadding={8}
                  verticalPadding={0}
                  labelStyle={{ marginHorizontal: 0, marginVertical: 0 }}
                  borderRadius={11}
                  animatedPress
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Порядок вопросов"
              accessibilityState={{ expanded: filters }}
              onPress={openFilters}
              style={styles.sortIndicator}
            >
              <Text numberOfLines={1} style={styles.sortText}>
                {sortLabel}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={17} color={COLORS.textSecondary} />
            </Pressable>
          </View>
        </View>
        {query.isPending && <Loading variant="inline" message="Загрузка вопросов…" />}
        {query.isError && !query.isFetchNextPageError && (
          <View style={st.group}>
            <Text accessibilityRole="alert" style={st.error}>
              Не удалось загрузить вопросы
            </Text>
            <QButton label="Повторить" secondary onPress={() => void refresh()} />
          </View>
        )}
        {query.isFetchNextPageError && (
          <Text accessibilityRole="alert" style={st.error}>
            Не удалось загрузить следующую страницу. Уже загруженные вопросы доступны.
          </Text>
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
            onPress={() => {
              if (isCurrent()) router.push(`/questions/${q.id}` as Href);
            }}
            style={({ pressed }) => [st.card, st.listCard, pressed && { opacity: 0.7 }]}
          >
            <QStatus question={q} compact />
            <Text style={st.listTitle}>{q.title}</Text>
            {q.bestAnswer && (
              <View style={st.listPreview}>
                <Text style={st.label}>Лучший ответ</Text>
                <Text style={[st.body, st.compactBody]} numberOfLines={2}>
                  {q.bestAnswer.body}
                </Text>
              </View>
            )}
            <QAuthor
              author={q.author}
              date={q.createdAt}
              listStats={`${q.answerCount} ${countWord(q.answerCount, ["ответ", "ответа", "ответов"])} · ${q.viewCount} ${countWord(q.viewCount, ["просмотр", "просмотра", "просмотров"])}`}
            />
          </Pressable>
        ))}
        {query.hasNextPage && (
          <QButton
            label={
              query.isFetchingNextPage
                ? "Загрузка…"
                : query.isFetchNextPageError
                  ? "Повторить загрузку"
                  : "Ещё вопросы"
            }
            secondary
            disabled={query.isFetchingNextPage}
            onPress={() => void loadMore()}
          />
        )}
        {query.isFetchingNextPage && <MascotSpinner />}
      </ScrollView>
      <Modal
        visible={filters}
        transparent
        animationType="slide"
        onRequestClose={() => setFilters(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Закрыть фильтры"
            onPress={() => setFilters(false)}
          />
          <View
            style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
            accessibilityViewIsModal
            importantForAccessibility="yes"
            accessibilityLabel="Фильтры вопросов"
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeading}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>Фильтры</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть фильтры"
                hitSlop={8}
                onPress={() => setFilters(false)}
              >
                <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.filterGroup} accessibilityRole="radiogroup"
                accessibilityLabel="Показывать">
                <Text style={styles.filterGroupLabel}>Показывать</Text>
                <View style={styles.filtersRow}>
                  {(["new", "active", "unanswered"] as const).map((v) => (
                    <QButton
                      key={v}
                      label={v === "new" ? "Новые" : v === "active" ? "Активные" : "Без ответа"}
                      secondary
                      compact
                      selected={sort === v}
                      onPress={() => setSort(v)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.filterGroup} accessibilityRole="radiogroup"
                accessibilityLabel="Категория">
                <Text style={styles.filterGroupLabel}>Категория</Text>
                <View style={styles.filtersRow}>
                  {["", ...QUESTION_CATEGORIES].map((c) => (
                    <QButton
                      key={c}
                      label={c || "Все категории"}
                      secondary
                      compact
                      selected={category === c}
                      onPress={() => setCategory(c)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.filterGroup} accessibilityRole="radiogroup"
                accessibilityLabel="Статус">
                <Text style={styles.filterGroupLabel}>Статус</Text>
                <View style={styles.filtersRow}>
                  {(["", "waiting", "answered", "resolved"] as const).map((v) => (
                    <QButton
                      key={v}
                      label={
                        v === ""
                          ? "Все"
                          : v === "waiting"
                            ? "Ждёт ответа"
                            : v === "answered"
                              ? "Есть ответы"
                              : "Решён"
                      }
                      secondary
                      compact
                      selected={status === v}
                      onPress={() => setStatus(v)}
                    />
                  ))}
                </View>
              </View>
            </ScrollView>
            <View style={styles.sheetFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Сбросить фильтры"
                style={styles.resetButton}
                onPress={() => {
                  setSort("new");
                  setCategory("");
                  setStatus("");
                }}
              >
                <Text style={styles.resetText}>Сбросить</Text>
              </Pressable>
              <View style={styles.applyButton}>
                <Button
                  label="Показать вопросы"
                  variant="primary"
                  onPress={() => setFilters(false)}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  headerImage: {
    height: 180,
    marginHorizontal: -SPACING.md,
    marginTop: -SPACING.md,
  },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 },
  searchSection: { gap: 8 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchField: {
    flex: 1,
    minWidth: 0,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#aaa791",
    borderRadius: 12,
    backgroundColor: "#faf7ef",
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    height: "100%",
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    color: COLORS.text,
    includeFontPadding: false,
  },
  filterButton: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#aaa791",
    borderRadius: 12,
    backgroundColor: "#faf7ef",
  },
  filterButtonText: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.primary },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    position: "absolute",
    right: 5,
    top: 5,
  },
  pressed: { opacity: 0.65 },
  scopeRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scopeSwitch: { flexDirection: "row", alignItems: "center", gap: 8 },
  sortIndicator: {
    flexDirection: "row",
    minHeight: 44,
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sortText: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.textSecondary },
  modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  filterSheet: {
    backgroundColor: "#faf7ef",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingHorizontal: 16,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 9,
    marginBottom: 12,
    backgroundColor: "#c3c0b4",
  },
  sheetHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
  },
  sheetTitle: { fontFamily: FONTS.montserratBold, fontSize: 18, color: COLORS.text },
  sheetContent: { gap: 20, paddingBottom: 22 },
  filterGroup: { gap: 9 },
  filterGroupLabel: { fontFamily: FONTS.montserratMedium, fontSize: 13, color: COLORS.text },
  sheetFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e3e0d4",
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  resetButton: { minHeight: 44, paddingHorizontal: 6, justifyContent: "center" },
  resetText: { fontFamily: FONTS.montserratMedium, fontSize: 13, color: COLORS.primary },
  applyButton: { flex: 1 },
});
