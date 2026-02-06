import { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, TextInput, Pressable } from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, SPACING, BORDER_RADIUS, FONTS } from "@/constants";

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
        <View style={styles.searchIconWrap} pointerEvents="none">
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={COLORS.onPrimary}
          />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor={COLORS.onPrimary}
          value={localValue}
          onChangeText={setLocalValue}
        />
        {localValue.length > 0 && (
          <Pressable
            style={styles.clearButton}
            onPress={handleClear}
            accessibilityLabel="Очистить поиск"
          >
            <MaterialCommunityIcons
              name="close"
              size={16}
              color={COLORS.onPrimary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: SPACING.sm,
    paddingTop: 20,
    paddingBottom: 10,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  searchWrapper: {
    position: "relative",
    width: "100%",
  },
  searchIconWrap: {
    position: "absolute",
    left: 16,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
  searchInput: {
    width: "100%",
    paddingVertical: 14,
    paddingLeft: 48,
    paddingRight: 48,
    borderWidth: 0,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary,
    color: COLORS.onPrimary,
    fontSize: 15,
    fontFamily: FONTS.montserrat,
    fontWeight: "500",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  clearButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    padding: 8,
    borderRadius: 6,
  },
});
