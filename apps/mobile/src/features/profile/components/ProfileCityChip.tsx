import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

import { COLORS, FONTS, SPACING } from "@/shared/config";

/** Non-interactive profile metadata: icon and city belong to one compact badge. */
export function ProfileCityChip({ city }: { city: string }) {
  return (
    <View style={styles.chip} accessible accessibilityLabel={`Город: ${city}`}>
      <MaterialCommunityIcons
        name="map-marker-outline"
        size={18}
        color={COLORS.primary}
        accessible={false}
      />
      <Text style={styles.label} numberOfLines={2} ellipsizeMode="tail">
        {city}
      </Text>
    </View>
  );
}

/** Keep profile facts on one line when there is room and wrap on smaller screens. */
export function ProfileMetaRow({
  city,
  ageLabel,
}: {
  city?: string | null;
  ageLabel?: string | null;
}) {
  if (!city && !ageLabel) return null;

  return (
    <View style={styles.row}>
      {city ? <ProfileCityChip city={city} /> : null}
      {ageLabel ? (
        <View style={styles.ageChip} accessible accessibilityLabel={ageLabel}>
          <Text style={styles.label}>{ageLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  ageChip: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingVertical: SPACING.sm,
    paddingHorizontal: 12,
    backgroundColor: "#ECE5D2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    maxWidth: "100%",
    minWidth: 0,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 12,
    backgroundColor: "#ECE5D2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  label: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
});
