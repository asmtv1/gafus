import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export type VideoQualityMode = "auto" | 360 | 720;
const choices: readonly VideoQualityMode[] = ["auto", 360, 720];

/** Same in-player quality menu for Moments and Chat2, no permanent toolbar. */
export function VideoQualitySettings({ value, onChange, available, embedded = false }: {
  value: VideoQualityMode;
  onChange: (mode: VideoQualityMode) => void;
  available: { 360?: string; 720?: string } | undefined | null;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!available?.[360] || !available?.[720]) return null;
  return <View style={embedded ? { width: 30, height: 34, justifyContent: "center", zIndex: 12 } : {
    position: "absolute", bottom: 44, right: 8, zIndex: 12,
    flexDirection: "row", alignItems: "flex-end", gap: 6,
  }}>
    {open && <View accessibilityLabel="Качество видео" style={{
      ...(embedded ? { position: "absolute" as const, bottom: 35, right: 0 } : {}),
      width: 144, padding: 4, borderRadius: 12,
      borderWidth: 1, borderColor: "#ffffff42", backgroundColor: "#17211df2",
    }}>
      <Text style={{ color: "#fff", opacity: .8, fontSize: 12, fontWeight: "600", padding: 5 }}>Качество</Text>
      {choices.map(mode => <Pressable key={mode} accessibilityRole="button"
        accessibilityLabel={mode === "auto" ? "Авто" : `${mode}p`}
        accessibilityState={{ selected: value === mode }}
        onPress={event => { event.stopPropagation(); onChange(mode); setOpen(false); }}
        style={{ minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 12, borderRadius: 7, backgroundColor: value === mode ? "#78894e" : "transparent" }}>
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
          {mode === "auto" ? "Авто" : `${mode}p`}
        </Text>
        {value === mode && <MaterialCommunityIcons name="check" size={17} color="#fff" />}
      </Pressable>)}
    </View>}
    <Pressable accessibilityRole="button" accessibilityLabel="Настройки качества видео"
      accessibilityState={{ expanded: open }} onPress={event => { event.stopPropagation(); setOpen(!open); }}
      style={{ width: embedded ? 30 : 42, height: embedded ? 34 : 42,
        borderRadius: embedded ? 7 : 21, borderWidth: embedded ? 0 : 1,
        borderColor: "#ffffff77", backgroundColor: embedded ? "transparent" : "#17211de3",
        alignItems: "center", justifyContent: "center" }}>
      <MaterialCommunityIcons name="cog-outline" size={embedded ? 20 : 24} color="#fff" />
    </Pressable>
  </View>;
}
