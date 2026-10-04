import { Image, StyleSheet, Text, View } from "react-native";
import { useMessageContext } from "stream-chat-expo";
import { FONTS } from "@/shared/config";

/** The SDK's outer pressable navigates to the original message. */
export function ChatQuotedReply() {
  const { message } = useMessageContext();
  const quote = message.quoted_message;
  if (!quote) return null;
  const deleted = !!quote.deleted_at || quote.type === "deleted";
  const attachment = quote.attachments?.[0];
  const thumbnail = attachment?.image_url || attachment?.thumb_url;
  const excerpt = deleted
    ? "Сообщение удалено"
    : quote.text ||
      (attachment?.type === "video"
        ? "Видео"
        : attachment?.type === "image"
          ? "Фото"
          : attachment?.title || "Вложение");
  return (
    <View
      style={styles.quote}
      accessibilityLabel={`Ответ пользователю ${quote.user?.name || "Пользователь"}: ${excerpt}`}
    >
      {!deleted && !!thumbnail && <Image source={{ uri: thumbnail }} style={styles.thumbnail} />}
      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.author}>
          {quote.user?.name || "Пользователь"}
        </Text>
        <Text numberOfLines={2} style={styles.excerpt}>
          {excerpt}
        </Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  quote: {
    flexDirection: "row",
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#FCF5E2",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    padding: 8,
    marginBottom: 4,
    minWidth: 120,
  },
  content: { flex: 1, minWidth: 0 },
  author: {
    fontFamily: FONTS.montserratBold,
    fontSize: 12,
    color: "#FCF5E2",
    marginBottom: 2,
  },
  excerpt: { fontFamily: FONTS.montserrat, fontSize: 12, color: "#FFFFFF" },
  thumbnail: { width: 36, height: 36, borderRadius: 4 },
});
