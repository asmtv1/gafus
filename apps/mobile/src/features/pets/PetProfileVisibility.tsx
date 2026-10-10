import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, FONTS } from "@/shared/config";
import { petsApi, type Pet } from "@/shared/lib/api/pets";
import type { ApiResponse } from "@/shared/lib/api/client";
import { petsQueryOptions } from "@/shared/lib/api/profileTabQueries";

export function PetProfileVisibility({ pet }: { pet: Pet }) {
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(pet.showInProfile);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const previous = useRef(pet.showInProfile);
  const thumbPosition = useRef(new Animated.Value(pet.showInProfile ? 1 : 0)).current;

  useEffect(() => {
    if (!busy.current) setChecked(pet.showInProfile);
  }, [pet.showInProfile]);

  useEffect(() => {
    Animated.timing(thumbPosition, {
      toValue: checked ? 1 : 0,
      duration: 170,
      useNativeDriver: true,
    }).start();
  }, [checked, thumbPosition]);

  const mutation = useMutation({
    networkMode: "always",
    mutationFn: async (next: boolean) => {
      const result = await petsApi.update(pet.id, { showInProfile: next });
      if (!result.success || !result.data) {
        throw new Error(result.error ?? "Не удалось сохранить настройку");
      }
      return result.data;
    },
    onSuccess: (updated) => {
      setChecked(updated.showInProfile);
      queryClient.setQueryData<ApiResponse<Pet[]>>(petsQueryOptions.queryKey, (current) =>
        current ? {
          ...current,
          data: current.data?.map((item) => item.id === pet.id
            ? { ...item, showInProfile: updated.showInProfile }
            : item),
        } : current,
      );
    },
    onError: () => {
      setChecked(previous.current);
      setError("Не удалось сохранить настройку. Попробуйте ещё раз.");
    },
    onSettled: () => {
      busy.current = false;
      void queryClient.invalidateQueries({ queryKey: petsQueryOptions.queryKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: ["public-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["trainer-public-profile"] });
    },
  });

  const handleChange = (next: boolean) => {
    if (busy.current) return;
    busy.current = true;
    previous.current = checked;
    setChecked(next);
    setError(null);
    mutation.mutate(next);
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={`Показывать в профиле: ${pet.name}`}
        accessibilityState={{ checked, disabled: mutation.isPending }}
        disabled={mutation.isPending}
        onPress={() => handleChange(!checked)}
        style={({ pressed }) => [
          styles.row,
          pressed && styles.rowPressed,
          mutation.isPending && styles.rowSaving,
        ]}
      >
        <MaterialCommunityIcons
          name={checked ? "eye-outline" : "eye-off-outline"}
          size={19}
          color={COLORS.primary}
        />
        <Text style={styles.label}>Показывать в профиле</Text>
        <View style={[styles.switchTrack, checked && styles.switchTrackActive]}>
          <Animated.View style={[styles.switchThumb, {
            transform: [{ translateX: thumbPosition.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 20],
            }) }],
          }]} />
        </View>
      </Pressable>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 15,
    backgroundColor: "#F9F5EC",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DED3B9",
  },
  rowPressed: { backgroundColor: "#F1EAD9" },
  rowSaving: { opacity: 0.7 },
  label: { flex: 1, fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.text },
  switchTrack: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E5DAC5",
    borderWidth: 1,
    borderColor: "#CDBF9F",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  switchTrackActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFDF6",
    shadowColor: "#352E2E",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 2,
    elevation: 2,
  },
  error: { fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 18, color: "#b42318", marginTop: 6 },
});
