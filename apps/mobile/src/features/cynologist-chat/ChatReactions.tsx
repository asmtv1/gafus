import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MessageUserReactions, useChatContext, useMessageContext } from "stream-chat-expo";
import { CHAT_REACTIONS } from "@gafus/consultation-shared";
import type { ReactionResponse } from "stream-chat";
import { COLORS } from "@/shared/config";

export const ChatReactionContext = createContext<{
  enabled: boolean;
  pending: boolean;
  change: (messageId: string, type: string, remove: boolean) => void;
} | null>(null);
export const supportedChatReactions = CHAT_REACTIONS.map(({ type, emoji }, index) => ({
  type,
  isMain: index < 6,
  Icon: () => <Text style={{ fontSize: 22 }}>{emoji}</Text>,
}));

export function ChatReactionPicker() {
  const { message, dismissOverlay } = useMessageContext();
  const controller = useContext(ChatReactionContext);
  const [expanded, setExpanded] = useState(false);
  if (!controller?.enabled || message.type === "deleted" || message.type === "system") return null;
  return (
    <View
      style={[styles.picker, expanded && styles.expanded]}
      accessibilityLabel="Реакции на сообщение"
    >
      {(expanded ? CHAT_REACTIONS : CHAT_REACTIONS.slice(0, 6)).map(({ type, emoji, label }) => {
        const selected = message.own_reactions?.some((reaction) => reaction.type === type) ?? false;
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected, disabled: controller.pending }}
            disabled={controller.pending}
            style={({ pressed }) => [
              styles.choice,
              selected && styles.selected,
              pressed && styles.pressed,
            ]}
            onPress={() => {
              controller.change(message.id, type, selected);
              dismissOverlay();
            }}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Свернуть реакции" : "Все реакции"}
        style={styles.choice}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.more}>{expanded ? "−" : "+"}</Text>
      </Pressable>
    </View>
  );
}

export function ChatReactionList() {
  const { message, alignment, showReactionsOverlay } = useMessageContext();
  const controller = useContext(ChatReactionContext);
  if (message.type === "deleted" || message.type === "system") return null;
  return (
    <View
      style={[styles.list, { justifyContent: alignment === "right" ? "flex-end" : "flex-start" }]}
    >
      {CHAT_REACTIONS.map(({ type, emoji, label }) => {
        const count =
          message.reaction_groups?.[type]?.count ?? message.reaction_counts?.[type] ?? 0;
        if (!count) return null;
        const selected = message.own_reactions?.some((reaction) => reaction.type === type) ?? false;
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${count}. Удерживайте, чтобы увидеть участников`}
            accessibilityState={{ selected, disabled: controller?.pending }}
            disabled={controller?.pending}
            style={({ pressed }) => [
              styles.pill,
              selected && styles.selected,
              pressed && styles.pressed,
            ]}
            onPress={() => {
              if (controller?.enabled) controller.change(message.id, type, selected);
              else showReactionsOverlay(type);
            }}
            onLongPress={() => showReactionsOverlay(type)}
          >
            <Text style={styles.count}>
              {emoji} {count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
/** Paginated participants; every mutation still uses the GAFUS API. */
export function ChatReactionUsers(props: React.ComponentProps<typeof MessageUserReactions>) {
  const { message: contextMessage } = useMessageContext();
  const message = props.message ?? contextMessage;
  const { client } = useChatContext();
  const controller = useContext(ChatReactionContext);
  const [type, setType] = useState(props.selectedReaction ?? "");
  const [rows, setRows] = useState<ReactionResponse[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const load = async (cursor?: string) => {
    const version = generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await client.queryReactions(
        message.id,
        type ? { type } : {},
        [{ created_at: -1 }],
        { limit: 30, next: cursor },
      );
      if (version === generation.current) {
        setRows((previous) => (cursor ? [...previous, ...result.reactions] : result.reactions));
        setNext(result.next);
      }
    } catch {
      if (version === generation.current) setError("Не удалось загрузить участников");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    generation.current++;
    setRows([]);
    setNext(undefined);
    void load();
    return () => {
      generation.current++;
    };
  }, [client, message.id, type, message.reaction_groups, message.reaction_counts]);
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ color: COLORS.primary, fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
        Кто поставил реакцию
      </Text>
      <ScrollView
        horizontal
        style={{ flexGrow: 0, marginBottom: 8 }}
        showsHorizontalScrollIndicator={false}
      >
        <Pressable
          style={[styles.pill, !type && styles.selected]}
          accessibilityRole="button"
          accessibilityState={{ selected: !type }}
          onPress={() => setType("")}
        >
          <Text style={styles.count}>Все</Text>
        </Pressable>
        {CHAT_REACTIONS.filter(
          (reaction) =>
            message.reaction_groups?.[reaction.type]?.count ||
            message.reaction_counts?.[reaction.type],
        ).map((reaction) => (
          <Pressable
            key={reaction.type}
            accessibilityRole="button"
            accessibilityLabel={reaction.label}
            accessibilityState={{ selected: type === reaction.type }}
            style={[styles.pill, type === reaction.type && styles.selected]}
            onPress={() => setType(reaction.type)}
          >
            <Text style={styles.count}>{reaction.emoji}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView style={{ flex: 1 }}>
        {rows.map((reaction, index) => {
          const own = reaction.user_id === client.userID;
          return (
            <Pressable
              key={`${reaction.user_id}-${reaction.type}-${index}`}
              accessibilityRole="button"
              disabled={!own || !controller?.enabled || controller.pending}
              onPress={() => controller?.change(message.id, reaction.type, true)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}
            >
              {reaction.user?.image ? (
                <Image
                  source={{ uri: reaction.user.image }}
                  style={{ width: 36, height: 36, borderRadius: 18 }}
                />
              ) : (
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "#d6dfae",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text>{reaction.user?.name?.[0]?.toUpperCase() || "?"}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.count}>{reaction.user?.name || "Пользователь"}</Text>
                {own && controller?.enabled && (
                  <Text style={{ fontSize: 12, color: COLORS.primary }}>Нажмите, чтобы убрать</Text>
                )}
              </View>
              <Text style={styles.emoji}>
                {CHAT_REACTIONS.find((item) => item.type === reaction.type)?.emoji ?? ""}
              </Text>
            </Pressable>
          );
        })}
        {loading && <ActivityIndicator color={COLORS.primary} />}
        {!!error && <Text accessibilityRole="alert">{error}</Text>}
        {!loading && !error && !rows.length && <Text>Пока нет реакций</Text>}
        {(next || error) && (
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            style={styles.pill}
            onPress={() => {
              void load(next);
            }}
          >
            <Text style={styles.count}>{error ? "Повторить" : "Загрузить ещё"}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: "#fffdf7",
    borderRadius: 24,
    padding: 4,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#ded9cb",
  },
  expanded: { flexWrap: "wrap", maxWidth: 320 },
  choice: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  emoji: { fontSize: 26 },
  more: { fontSize: 26, color: COLORS.primary },
  list: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  pill: {
    minHeight: 36,
    minWidth: 48,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#eeeedf",
  },
  selected: { backgroundColor: "#d6dfae" },
  count: { fontSize: 15, color: COLORS.primary },
  pressed: { opacity: 0.65, transform: [{ scale: 0.94 }] },
});
