import { ScrollView, StyleSheet, View } from "react-native";
import { MessageActionListItem, type MessageActionListProps } from "stream-chat-expo";
import { COLORS } from "@/shared/config";

export function ChatMessageActionList({ messageActions = [] }: MessageActionListProps) {
  if (!messageActions.length) return null;
  return (
    <ScrollView
      accessibilityRole="menu"
      accessibilityLabel="Действия с сообщением"
      style={styles.menu}
    >
      {messageActions.map((action, index) => (
        <View key={action.actionType} style={index > 0 ? styles.separator : undefined}>
          <MessageActionListItem
            {...action}
            titleStyle={{ color: action.type === "destructive" ? COLORS.error : COLORS.primary }}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  menu: { marginTop: 8, minWidth: 210, borderRadius: 16, backgroundColor: COLORS.cardBackground },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.primary },
});
