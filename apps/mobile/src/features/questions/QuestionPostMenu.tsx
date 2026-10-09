import type { ComponentProps } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, FONTS } from "@/shared/config";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export interface QuestionPostAction {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export function QuestionPostMenu({
  visible,
  onClose,
  actions,
  title = "Действия с вопросом",
}: {
  visible: boolean;
  onClose: () => void;
  actions: QuestionPostAction[];
  title?: string;
}) {
  const choose = (action: QuestionPostAction) => {
    if (action.disabled) return;
    onClose();
    // Close the iOS modal before presenting Share or a native confirmation Alert.
    setTimeout(action.onPress, Platform.OS === "ios" ? 300 : 0);
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть меню действий"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View style={styles.panel}>
          <View style={styles.handle} />
          <Text style={styles.heading}>{title}</Text>
          {actions.map((action) => (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityState={{ disabled: !!action.disabled }}
              disabled={action.disabled}
              onPress={() => choose(action)}
              style={({ pressed }) => [
                styles.action,
                (pressed || action.disabled) && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name={action.icon}
                size={22}
                color={action.destructive ? "#aa4242" : COLORS.primary}
              />
              <Text style={[styles.actionLabel, action.destructive && styles.destructive]}>
                {action.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Отмена"
            onPress={onClose}
            style={styles.cancel}
          >
            <Text style={styles.cancelLabel}>Отмена</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  panel: {
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: COLORS.cardBackground,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 4,
    alignSelf: "center",
    backgroundColor: "#b9b7a8",
    marginBottom: 14,
  },
  heading: {
    fontFamily: FONTS.montserratMedium,
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 10,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 54,
    paddingHorizontal: 10,
  },
  pressed: { opacity: 0.5 },
  actionLabel: {
    flex: 1,
    fontFamily: FONTS.montserratMedium,
    fontSize: 15,
    color: COLORS.text,
  },
  destructive: { color: "#aa4242" },
  cancel: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#ece8dd",
  },
  cancelLabel: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 15,
    color: COLORS.text,
  },
});
