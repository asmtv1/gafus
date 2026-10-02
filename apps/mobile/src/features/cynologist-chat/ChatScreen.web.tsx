import { Linking, StyleSheet, Text, View } from "react-native";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { Button } from "@/shared/components/ui/Button";
import { COLORS, FONTS } from "@/shared/config";

/** Expo's native Stream SDK is excluded from web; the website owns browser chat. */
export default function ChatScreen({
  chatId,
  community = false,
  insideHub = false,
}: {
  chatId?: string;
  community?: boolean;
  insideHub?: boolean;
}) {
  const path = community
    ? "/cynologist-chat?tab=community"
    : chatId
      ? `/cynologist-chats/${encodeURIComponent(chatId)}`
      : "/cynologist-chat";
  return (
    <TexturedSafeAreaView style={styles.page} edges={insideHub ? ["bottom"] : ["top", "bottom"]}>
      <View style={styles.content}>
        <Text style={styles.title}>{community ? "Общий чат" : "Чат с кинологом"}</Text>
        <Text style={styles.text}>Переписка в браузере доступна на сайте Гафус.</Text>
        <Button
          label="Открыть чат"
          onPress={() => void Linking.openURL(`https://gafus.ru${path}`)}
        />
      </View>
    </TexturedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 24, gap: 20, maxWidth: 600, width: "100%", alignSelf: "center" },
  title: { fontFamily: FONTS.montserratBold, fontSize: 24, color: COLORS.primary },
  text: { fontFamily: FONTS.montserrat, fontSize: 16, color: COLORS.text },
});
