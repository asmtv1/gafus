import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { Button } from "@/shared/components/ui/Button";
import { FONTS } from "@/shared/config";
import ChatScreen from "./ChatScreen";
import DialogsScreen from "./DialogsScreen";
export default function ChatHubScreen({ trainer = false }: { trainer?: boolean }) {
  const [community, setCommunity] = useState(false);
  return (
    <TexturedSafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.tabs}>
        <Button
          label="Чат с кинологом"
          variant={community ? "primary" : "selected"}
          flex={1}
          fullWidth={false}
          height={52}
          fontSize={12}
          lineHeight={18}
          fontFamily={FONTS.montserratMedium}
          horizontalPadding={6}
          verticalPadding={0}
          borderRadius={12}
          animatedPress
          compact
          onPress={() => setCommunity(false)}
          accessibilityState={{ selected: !community }}
        />
        <Button
          label="Общий чат"
          variant={community ? "selected" : "primary"}
          flex={1}
          fullWidth={false}
          height={52}
          fontSize={12}
          lineHeight={18}
          fontFamily={FONTS.montserratMedium}
          horizontalPadding={6}
          verticalPadding={0}
          borderRadius={12}
          animatedPress
          compact
          onPress={() => setCommunity(true)}
          accessibilityState={{ selected: community }}
        />
      </View>
      <View style={styles.flex}>
        {community ? (
          <ChatScreen community insideHub />
        ) : trainer ? (
          <DialogsScreen insideHub />
        ) : (
          <ChatScreen insideHub />
        )}
      </View>
    </TexturedSafeAreaView>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
});
