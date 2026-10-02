import { lazy, Suspense } from "react";
import { Linking, StyleSheet, Text, TurboModuleRegistry, View } from "react-native";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { Button } from "@/shared/components/ui/Button";
import { Loading } from "@/shared/components/ui/Loading";
import { COLORS, FONTS } from "@/shared/config";

// Expo Router evaluates route imports before a screen is opened. Keep the native
// SDK behind this boundary so Expo Go / an older binary can register every route.
const NativeCommunityChatScreen = lazy(() => import("./NativeCommunityChatScreen"));
const NativeChatScreen = lazy(() => import("./NativeChatScreen"));

export default function ChatScreen({
  chatId,
  community = false,
  insideHub = false,
}: {
  chatId?: string;
  community?: boolean;
  insideHub?: boolean;
}) {
  if (!TurboModuleRegistry.get("StreamVideoThumbnail")) {
    const path = community
      ? "/cynologist-chat?tab=community"
      : chatId
        ? `/cynologist-chats/${encodeURIComponent(chatId)}`
        : "/cynologist-chat";
    return (
      <TexturedSafeAreaView style={styles.page} edges={insideHub ? ["bottom"] : ["top", "bottom"]}>
        <View style={styles.content}>
          <Text style={styles.title}>{community ? "Общий чат" : "Чат с кинологом"}</Text>
          <Text style={styles.text}>
            {__DEV__
              ? "Для проверки чата нужна новая development-сборка Гафус. Expo Go этот экран не поддерживает."
              : "Обновите приложение, чтобы пользоваться чатом с кинологом."}
          </Text>
          <Button
            label="Открыть чат на сайте"
            onPress={() => void Linking.openURL(`https://gafus.ru${path}`)}
          />
        </View>
      </TexturedSafeAreaView>
    );
  }
  return (
    <Suspense fallback={<Loading message="Загрузка сообщений…" fullScreen embedded={insideHub} />}>
      {community ? (
        <NativeCommunityChatScreen />
      ) : (
        <NativeChatScreen chatId={chatId} insideHub={insideHub} />
      )}
    </Suspense>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 24, gap: 20, maxWidth: 600, width: "100%", alignSelf: "center" },
  title: { fontFamily: FONTS.montserratBold, fontSize: 24, color: COLORS.primary },
  text: { fontFamily: FONTS.montserrat, fontSize: 16, color: COLORS.text },
});
