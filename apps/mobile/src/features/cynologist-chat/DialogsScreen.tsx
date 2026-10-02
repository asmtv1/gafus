import { useTabContentBottomPadding } from "@/shared/lib/useTabContentBottomPadding";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import type { CynologistChatDto } from "@gafus/consultation-shared";
import { chatApi } from "@/shared/lib/api/cynologistChat";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { Loading } from "@/shared/components/ui/Loading";
export default function DialogsScreen({ insideHub = false }: { insideHub?: boolean }) {
  const tabContentBottomPadding = useTabContentBottomPadding();
  const [data, setData] = useState<{
    items: CynologistChatDto[];
    nextCursor: string | null;
  } | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();
  const load = useCallback(async (cursor?: string) => {
    try {
      const next = await chatApi<{ items: CynologistChatDto[]; nextCursor: string | null }>(
        "dialogs",
        { cursor },
      );
      setData((old) => ({
        ...next,
        items: cursor ? [...(old?.items ?? []), ...next.items] : next.items,
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  if (!data && !error) return <Loading fullScreen embedded={insideHub} />;
  return (
    <TexturedSafeAreaView style={{ flex: 1 }} edges={insideHub ? ["bottom"] : ["top", "bottom"]}>
      <Text style={{ fontSize: 24, padding: 16 }}>Диалоги</Text>
      {error && <Text accessibilityRole="alert">{error}</Text>}
      <FlatList
        contentContainerStyle={{ paddingBottom: tabContentBottomPadding }}
        data={data?.items ?? []}
        keyExtractor={(c) => c.id}
        onRefresh={() => void load()}
        refreshing={false}
        onEndReached={() => {
          if (data?.nextCursor) void load(data.nextCursor);
        }}
        ListEmptyComponent={
          data ? (
            <Text style={{ padding: 16 }}>
              Пока нет диалогов. Здесь появятся сообщения клиентов.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/cynologist-chats/${item.id}` as Href)}
          >
            <View style={{ padding: 18, margin: 10, borderRadius: 16, backgroundColor: "#fffdf7" }}>
              <Text>
                {item.intake.clientOwnerName} · {item.intake.petName}
              </Text>
              {item.unreadCount > 0 && <Text>{item.unreadCount} непрочитанных</Text>}
              {item.lastMessageAt && (
                <Text>{new Date(item.lastMessageAt).toLocaleString("ru-RU")}</Text>
              )}
            </View>
          </Pressable>
        )}
      />
    </TexturedSafeAreaView>
  );
}
