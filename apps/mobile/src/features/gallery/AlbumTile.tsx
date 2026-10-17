import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { GalleryAlbumDto } from "@gafus/types";

import { COLORS } from "@/shared/config";
import { GalleryImage } from "./image";
import { styles as s } from "./styles";

/** Shared album card for the gallery and profile preview. */
export const AlbumTile = memo(function AlbumTile({
  album,
  refresh,
  compact = false,
}: {
  album: GalleryAlbumDto;
  refresh: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [compact ? s.albumCompact : s.album, pressed && s.albumPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Альбом «${album.name}», ${album.photoCount} фото${album.isVisible ? "" : ", только для вас"}`}
      onPress={() => router.push({
        pathname: "/profile/albums/[albumId]",
        params: { albumId: album.id, username: album.ownerUsername },
      })}
    >
      <View style={s.albumArtwork}>
        {album.coverThumbUrl ? (
          <GalleryImage
            photoId={album.coverDisplayPhotoId ?? album.coverPhotoId}
            source={{ uri: album.coverThumbUrl }}
            style={s.albumArtworkImage}
            contentFit="cover"
            refresh={refresh}
          />
        ) : (
          <View style={[s.albumArtworkImage, s.placeholder]}>
            <MaterialCommunityIcons name="image-multiple-outline" size={34}
              color={COLORS.textSecondary} />
          </View>
        )}
        <View style={s.albumBadge} pointerEvents="none" accessible={false}>
          <MaterialCommunityIcons name="image-multiple-outline" size={12} color={COLORS.primary} />
          <Text style={s.albumBadgeText}>Альбом</Text>
        </View>
      </View>
      <View style={s.albumInfo}>
        <Text numberOfLines={2} style={s.albumCompactName}>{album.name}</Text>
        {album.description?.trim() ? (
          <Text numberOfLines={2} ellipsizeMode="tail" style={s.albumSummary}>
            {album.description.trim()}
          </Text>
        ) : null}
        <Text numberOfLines={2} style={s.albumMeta}>
          {album.photoCount} фото{album.isVisible ? "" : " · Только вам"}
        </Text>
      </View>
    </Pressable>
  );
});
