import { StyleSheet, View } from "react-native";
import { TextInput, HelperText, type TextInputProps } from "react-native-paper";
import { BORDER_RADIUS, SPACING, COLORS } from "@/constants";

interface InputProps extends Omit<TextInputProps, "mode"> {
  error?: string;
}

/**
 * Текстовый инпут с поддержкой ошибок
 * Обёртка над React Native Paper TextInput (стиль как в веб)
 */
export function Input({ error, style, ...props }: InputProps) {
  return (
    <View style={styles.container}>
      <TextInput
        mode="outlined"
        error={!!error}
        style={[styles.input, style]}
        outlineStyle={styles.outline}
        outlineColor={COLORS.border}
        activeOutlineColor={COLORS.primary}
        textColor={COLORS.text}
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
});
