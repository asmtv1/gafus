import { useId, useMemo } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  HelperText,
  TextInput,
  useTheme,
  type TextInputProps,
} from "react-native-paper";
import { BORDER_RADIUS, SPACING, COLORS } from "@/shared/config";

const IOS_NUMERIC_KEYBOARD_TYPES: TextInputProps["keyboardType"][] = [
  "number-pad",
  "decimal-pad",
  "phone-pad",
];

interface InputProps extends Omit<TextInputProps, "mode" | "error"> {
  error?: string;
  /**
   * iOS: панель «Готово» над клавиатурой.
   * По умолчанию включается для number-pad / decimal-pad / phone-pad.
   */
  keyboardDoneAccessory?: boolean;
}

/**
 * Текстовый инпут с поддержкой ошибок
 * Обёртка над React Native Paper TextInput (стиль как в веб)
 * Подпись/плейсхолдер — COLORS.text: иначе MD3 даёт бледный onSurfaceVariant
 */
export function Input({
  error,
  style,
  theme: themeOverride,
  keyboardType,
  keyboardDoneAccessory,
  ...props
}: InputProps) {
  const reactId = useId();
  const accessoryNativeId = `gafus-input-acc-${reactId.replace(/:/g, "")}`;

  const showIosKeyboardDone =
    Platform.OS === "ios" &&
    (keyboardDoneAccessory === true ||
      (keyboardDoneAccessory !== false &&
        keyboardType != null &&
        IOS_NUMERIC_KEYBOARD_TYPES.includes(keyboardType)));

  const paperTheme = useTheme();
  const inputTheme = useMemo(
    () => ({
      ...paperTheme,
      colors: {
        ...paperTheme.colors,
        ...(themeOverride &&
        typeof themeOverride === "object" &&
        "colors" in themeOverride &&
        themeOverride.colors
          ? themeOverride.colors
          : {}),
        onSurfaceVariant: COLORS.text,
      },
    }),
    [paperTheme, themeOverride],
  );

  return (
    <View style={styles.container}>
      {showIosKeyboardDone ? (
        <InputAccessoryView nativeID={accessoryNativeId}>
          <View style={styles.keyboardAccessory}>
            <Pressable
              onPress={() => Keyboard.dismiss()}
              style={({ pressed }) => [
                styles.keyboardAccessoryDone,
                pressed && styles.keyboardAccessoryDonePressed,
              ]}
              hitSlop={12}
            >
              <Text style={styles.keyboardAccessoryDoneText}>Готово</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
      <TextInput
        mode="outlined"
        error={!!error}
        style={[styles.input, style]}
        outlineStyle={styles.outline}
        outlineColor={COLORS.border}
        activeOutlineColor={COLORS.primary}
        textColor={COLORS.text}
        placeholderTextColor={COLORS.text}
        theme={inputTheme}
        keyboardType={keyboardType}
        inputAccessoryViewID={showIosKeyboardDone ? accessoryNativeId : undefined}
        {...props}
      />
      {error && (
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.cardBackground,
  },
  outline: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 2,
  },
  keyboardAccessory: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "#E8E4DC",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  keyboardAccessoryDone: {
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
  },
  keyboardAccessoryDonePressed: {
    opacity: 0.7,
  },
  keyboardAccessoryDoneText: {
    fontSize: 17,
    fontWeight: "600",
    color: COLORS.primary,
  },
});
