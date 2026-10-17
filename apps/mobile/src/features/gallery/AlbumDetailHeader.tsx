import { useState, type ReactNode } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { GALLERY_LIMITS, type GalleryAlbumDto } from "@gafus/types";

import { COLORS, FONTS } from "@/shared/config";

/** Album details read as one surface rather than detached labels above the photos. */
export function AlbumDetailHeader({
  album,
  usedSlots,
  actions,
}: {
  album: Pick<GalleryAlbumDto, "name" | "description" | "photoCount" | "isVisible">;
  /** Total across the user's gallery, not the count in this album. */
  usedSlots?: number;
  actions?: ReactNode;
}) {
  const description = album.description?.trim();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const canExpandDescription = Boolean(description && description.length > 90);

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingContent}>
          <Text accessibilityRole="header" style={styles.title} numberOfLines={3}>
            {album.name}
          </Text>
          {description ? (
            <View style={styles.descriptionBlock}>
              <Text style={styles.descriptionLabel}>Описание альбома</Text>
              <Text
                style={styles.description}
                numberOfLines={canExpandDescription && !descriptionExpanded ? 2 : undefined}
              >
                {description}
              </Text>
              {canExpandDescription && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={descriptionExpanded ? "Свернуть описание" : "Развернуть описание"}
                  accessibilityState={{ expanded: descriptionExpanded }}
                  onPress={() => setDescriptionExpanded(current => !current)}
                  style={styles.moreDescription}
                >
                  <Text style={styles.moreDescriptionText}>
                    {descriptionExpanded ? "Свернуть" : "Ещё"}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
        {actions}
      </View>
      <View style={styles.detailsRow}>
        <View style={styles.chip}>
          <MaterialCommunityIcons
            name="image-multiple-outline"
            size={15}
            color={COLORS.primary}
            accessible={false}
          />
          <Text style={styles.chipText}>{album.photoCount} фото</Text>
        </View>
        <View style={[styles.chip, album.isVisible ? styles.publicChip : styles.privateChip]}>
          <MaterialCommunityIcons
            name={album.isVisible ? "eye-outline" : "lock-outline"}
            size={15}
            color={COLORS.primary}
            accessible={false}
          />
          <Text style={styles.chipText}>
            {album.isVisible ? "Виден в GAFUS" : "Только для вас"}
          </Text>
        </View>
        {usedSlots !== undefined && (
          <Text style={styles.galleryQuota}>
            В галерее: {usedSlots} из {GALLERY_LIMITS.slots}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    backgroundColor: "#FFFCF5",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4DFC9",
    gap: 12,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  headingContent: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  title: {
    color: COLORS.text,
    fontFamily: FONTS.montserratBold,
    fontSize: 18,
    lineHeight: 25,
  },
  descriptionBlock: {
    gap: 3,
  },
  descriptionLabel: {
    fontFamily: FONTS.montserratMedium,
    fontSize: 11,
    lineHeight: 16,
    color: "#808574",
  },
  description: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  moreDescription: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
    paddingRight: 12,
  },
  moreDescriptionText: {
    color: COLORS.primary,
    fontSize: 12,
    fontFamily: FONTS.montserratMedium,
  },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  chip: {
    minHeight: 28,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: "#F0EBDC",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  publicChip: { backgroundColor: "#E9EFDF" },
  privateChip: { backgroundColor: "#F0E9DB" },
  chipText: {
    color: COLORS.primary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 11,
    lineHeight: 17,
  },
  galleryQuota: {
    color: "#74796C",
    fontFamily: FONTS.montserrat,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 3,
  },
});
