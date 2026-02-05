import { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, TextInput, Pressable } from "react-native";
import { Text } from "react-native-paper";

import { COLORS, SPACING, BORDER_RADIUS } from "@/constants";

const DEBOUNCE_MS = 300;

interface CourseSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Поле поиска курсов с debounce (как в web).
 */
export function CourseSearch({
  value,
  onChange,
  placeholder = "Поиск курсов...",
}: CourseSearchProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(localValue);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [localValue, onChange]);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleClear = useCallback(() => {
    setLocalValue("");
    onChange("");
  }, [onChange]);

  return (
    <View style={styles.searchContainer}>
      <View style={styles.searchWrapper}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textSecondary}
          value={localValue}
          onChangeText={setLocalValue}
        />
        {localValue.length > 0 && (
          <Pressable style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.clearButtonText}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  searchWrapper: {
    position: "relative",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  searchIcon: {
    position: "absolute",
    left: 16,
    top: "50%",
    marginTop: -10,
    fontSize: 18,
    zIndex: 1,
  },
  searchInput: {
    width: "100%",
    paddingVertical: 14,
    paddingLeft: 48,
    paddingRight: 48,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.cardBackground,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "500",
  },
  clearButton: {
    position: "absolute",
    right: 12,
    top: "50%",
    marginTop: -14,
    padding: 8,
    borderRadius: 6,
  },
  clearButtonText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
});
