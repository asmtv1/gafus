import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Image } from "expo-image";
import { formatPetAge, getPetTypeLabel } from "@gafus/core/utils";

import type { PublicProfile } from "@/shared/lib/api/user";
import { COLORS, FONTS, SPACING } from "@/shared/config";

export function PublicPets({ pets }: { pets: NonNullable<PublicProfile["pets"]> }) {
  if (pets.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">ПИТОМЦЫ</Text>
      <View style={styles.list}>
        {pets.map((pet) => {
          const age = formatPetAge(pet.birthDate);
          return (
            <View key={pet.id} style={styles.card}>
              <Image
                source={pet.photoUrl ? { uri: pet.photoUrl } : pet.type === "CAT"
                  ? require("../../../assets/images/pet-avatar-cat.png")
                  : require("../../../assets/images/pet-avatar-dog.png")}
                style={styles.photo}
                contentFit="cover"
                accessibilityLabel={`Питомец ${pet.name}`}
              />
              <View style={styles.info}>
                <Text style={styles.species}>{getPetTypeLabel(pet.type)}</Text>
                <Text style={styles.name}>{pet.name}</Text>
                <Text style={styles.detail}>{pet.breed || "Порода не указана"}</Text>
                {age ? <Text style={styles.detail}>{age}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: SPACING.md },
  heading: { fontFamily: FONTS.impact, fontSize: 14, color: COLORS.text, marginBottom: SPACING.sm },
  list: { gap: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 16, padding: 12, backgroundColor: "#FFFAF0", borderWidth: 1, borderColor: "#D4C4A8", borderRadius: 16 },
  photo: { width: 72, height: 72, borderRadius: 36, flexShrink: 0 },
  info: { flex: 1, minWidth: 0, gap: 3 },
  species: { fontFamily: FONTS.montserrat, fontSize: 12, color: COLORS.primary },
  name: { fontFamily: FONTS.montserratMedium, fontSize: 18, color: COLORS.text },
  detail: { fontFamily: FONTS.montserrat, fontSize: 13, lineHeight: 19, color: COLORS.text },
});
