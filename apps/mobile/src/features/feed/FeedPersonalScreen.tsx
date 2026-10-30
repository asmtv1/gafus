import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppBackButton, Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { feedApi } from "@/shared/lib/api/feed";
import { FeedPostCard } from "./screens";
import { FeedSectionShortcuts } from "./FeedSectionShortcuts";
export function FeedPersonalScreen({ hidden = false }: { hidden?: boolean }) {
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && binding?.principalId === owner ? binding.authEpoch : null;
  if (!owner || !epoch)
    return (
      <TexturedSafeAreaView style={{ flex: 1 }}>
        <Text style={styles.text}>Для просмотра личных разделов войдите в аккаунт.</Text>
      </TexturedSafeAreaView>
    );
  return (
    <ActorFeedPersonal
      key={`${owner}:${epoch}:${hidden}`}
      owner={owner}
      epoch={epoch}
      hidden={hidden}
    />
  );
}
function ActorFeedPersonal({
  owner,
  epoch,
  hidden,
}: {
  owner: string;
  epoch: string;
  hidden: boolean;
}) {
  const router = useRouter(),
    cache = useQueryClient();
  const mounted = useRef(true);
  const mutation = useRef(false),
    paging = useRef(false),
    retrying = useRef(false),
    unknownRef = useRef(false);
  const acknowledged = useRef(new Set<string>());
  const [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [notice, setNotice] = useState("");
  const current = () => {
    const s = useAuthStore.getState();
    const b = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      mounted.current &&
      s.isAuthenticated &&
      !s.isLoading &&
      s.user?.id === owner &&
      b?.principalId === owner &&
      b.authEpoch === epoch
    );
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const saved = useInfiniteQuery({
    queryKey: ["feed", "saved", owner, epoch],
    queryFn: ({ pageParam }) => feedApi.listBookmarks({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: !hidden,
  });
  const authors = useInfiniteQuery({
    queryKey: ["feed", "hidden-authors", owner, epoch],
    queryFn: ({ pageParam }) => feedApi.listHiddenAuthors({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: hidden,
  });
  const active = hidden ? authors : saved;
  const retry = async () => {
    if (retrying.current || !current()) return;
    retrying.current = true;
    try {
      await active.refetch();
    } catch {
      if (current())
        reportClientError(new Error("FEED_PERSONAL_REFETCH_FAILED"), {
          issueKey: "FeedPersonal",
          keys: { operation: "refetch" },
        });
    } finally {
      retrying.current = false;
    }
  };
  const nextPage = async () => {
    if (paging.current || active.isFetchingNextPage || !active.hasNextPage || !current()) return;
    paging.current = true;
    try {
      await active.fetchNextPage();
    } catch {
      if (current()) {
        reportClientError(new Error("FEED_PERSONAL_PAGE_FAILED"), {
          issueKey: "FeedPersonal",
          keys: { operation: "next_page" },
        });
        setNotice("Не удалось загрузить следующую страницу. Попробуйте ещё раз.");
      }
    } finally {
      paging.current = false;
    }
  };
  const showAuthor = async (id: string) => {
    if (mutation.current || unknownRef.current || acknowledged.current.has(id) || !current())
      return;
    mutation.current = true;
    setBusy(true);
    setNotice("");
    let committed = false;
    try {
      await feedApi.setAuthorPreference(id, { hidden: false });
      if (!current()) return;
      committed = true;
      acknowledged.current.add(id);
      try {
        await cache.invalidateQueries({ queryKey: ["feed"] });
      } catch {
        if (current()) {
          reportClientError(new Error("FEED_PERSONAL_CACHE_FAILED"), {
            issueKey: "FeedPersonal",
            keys: { operation: "invalidate" },
          });
          setNotice("Изменение сохранено. Для обновления списка откройте раздел снова.");
        }
      }
    } catch {
      if (current() && !committed) {
        unknownRef.current = true;
        setUnknown(true);
        reportClientError(new Error("FEED_PERSONAL_WRITE_UNKNOWN"), {
          issueKey: "FeedPersonal",
          keys: { operation: "show_author" },
        });
        Alert.alert(
          "Моменты",
          "Результат изменения неизвестен. Проверьте список; повторное действие заблокировано.",
        );
      }
    } finally {
      mutation.current = false;
      if (current()) setBusy(false);
    }
  };
  return (
    <TexturedSafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppBackButton
          onPress={() => {
            if (current()) router.back();
          }}
        />
        <Text accessibilityRole="header" style={styles.heading}>
          {hidden ? "Скрытые авторы" : "Закладки"}
        </Text>
        <View style={styles.shortcuts}>
          <FeedSectionShortcuts active={hidden ? "hidden" : "saved"} />
        </View>
        {hidden && (
          <Text style={styles.text}>
            Публикации этих авторов скрыты в разделе «Моменты». Их профили и сохранённые публикации
            доступны.
          </Text>
        )}
        {!!notice && (
          <Text accessibilityRole="alert" style={styles.text}>
            {notice}
          </Text>
        )}
        {active.isFetchNextPageError && (
          <Text accessibilityRole="alert" style={styles.text}>
            Не удалось загрузить следующую страницу. Уже показанные записи доступны.
          </Text>
        )}
        {active.isPending ? (
          <Loading message="Загрузка…" />
        ) : active.isError && !active.isFetchNextPageError ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку"
            onPress={() => void retry()}
          >
            <Text style={styles.link}>Не удалось загрузить. Повторить</Text>
          </Pressable>
        ) : !active.data?.pages.some((page) => page.items.length) ? (
          <Text style={styles.text}>
            {hidden ? "Скрытых авторов пока нет." : "Сохранённых публикаций пока нет."}
          </Text>
        ) : null}
        {hidden
          ? authors.data?.pages
              .flatMap((page) => page.items)
              .map((author) => (
                <View key={author.id} style={styles.author}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Профиль ${author.name}`}
                    onPress={() => {
                      if (current())
                        router.push({
                          pathname: "/profile/[username]",
                          params: { username: author.username },
                        } as Href);
                    }}
                  >
                    <Text style={styles.text}>{author.name}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Показывать автора ${author.name} в Моментах`}
                    disabled={busy || unknown || acknowledged.current.has(author.id)}
                    style={styles.button}
                    onPress={() => void showAuthor(author.id)}
                  >
                    <Text style={styles.link}>Показывать в «Моментах»</Text>
                  </Pressable>
                </View>
              ))
          : saved.data?.pages
              .flatMap((page) => page.items)
              .map((post) => (
                <View key={post.id} style={{ marginBottom: 20 }}>
                  <FeedPostCard post={post} />
                </View>
              ))}
        {active.hasNextPage && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={active.isFetchNextPageError ? "Повторить страницу" : "Показать ещё"}
            style={styles.button}
            disabled={active.isFetchingNextPage}
            onPress={() => void nextPage()}
          >
            <Text style={styles.link}>
              {active.isFetchNextPageError ? "Повторить страницу" : "Показать ещё"}
            </Text>
          </Pressable>
        )}
        {active.isFetchingNextPage && <MascotSpinner />}
      </ScrollView>
    </TexturedSafeAreaView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  heading: { fontFamily: FONTS.montserratMedium, color: COLORS.text, fontSize: 22 },
  text: { fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 15, lineHeight: 22 },
  link: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 15 },
  button: { minHeight: 44, justifyContent: "center" },
  author: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.primary,
  },
  shortcuts: { marginHorizontal: -20 },
});
