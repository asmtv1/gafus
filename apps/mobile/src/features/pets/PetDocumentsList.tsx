import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  getPetDocumentDisplayName,
  type PetDocumentDto,
} from "@gafus/types";

import { COLORS, FONTS, SPACING } from "@/shared/config";

type PetDocumentsListProps = {
  documents: PetDocumentDto[];
  busy?: boolean;
  onOpen: (document: PetDocumentDto) => void;
  onRename: (document: PetDocumentDto) => void;
  onShare: (document: PetDocumentDto) => void;
  onDownload: (document: PetDocumentDto) => void;
  onDelete: (document: PetDocumentDto) => void;
};

/**
 * File-manager style document index. The document itself is the primary tap
 * target; secondary and destructive actions are grouped behind a labelled menu.
 */
export function PetDocumentsList({
  documents,
  busy = false,
  onOpen,
  onRename,
  onShare,
  onDownload,
  onDelete,
}: PetDocumentsListProps) {
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

  const action = (
    document: PetDocumentDto,
    label: string,
    icon: "pencil-outline" | "share-variant-outline" | "download-outline" | "trash-can-outline",
    callback: (document: PetDocumentDto) => void,
    destructive = false,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${getPetDocumentDisplayName(document.name)}`}
      disabled={busy}
      onPress={() => {
        setOpenActionsId(null);
        callback(document);
      }}
      style={({ pressed }) => [
        styles.action,
        pressed && styles.pressed,
        busy && styles.disabled,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={19}
        color={destructive ? "#A34743" : COLORS.primary}
      />
      <Text style={[styles.actionText, destructive && styles.dangerText]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.list} accessibilityLabel="Список документов питомца">
      {documents.map((document, index) => {
        const isImage = document.mimeType.startsWith("image/");
        const name = getPetDocumentDisplayName(document.name);
        const actionsOpen = openActionsId === document.id;
        const date = new Date(document.createdAt);
        const dateText = Number.isNaN(date.valueOf())
          ? ""
          : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });

        return (
          <View key={document.id}>
            {index > 0 && <View style={styles.divider} />}
            <View style={styles.row}>
              <Pressable
                style={({ pressed }) => [styles.open, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Открыть документ ${name}`}
                onPress={() => onOpen(document)}
              >
                {isImage ? (
                  <Image
                    source={{ uri: document.url }}
                    style={styles.thumbnail}
                    contentFit="contain"
                    accessible={false}
                  />
                ) : (
                  <View style={styles.fileIcon}>
                    <MaterialCommunityIcons name="file-pdf-box" size={27} color={COLORS.primary} />
                  </View>
                )}
                <View style={styles.details}>
                  <Text style={styles.name} numberOfLines={2}>{name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {isImage ? "Фото" : "PDF"}{dateText ? ` · ${dateText}` : ""}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.moreButton,
                  actionsOpen && styles.moreButtonActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Действия с документом ${name}`}
                accessibilityState={{ expanded: actionsOpen }}
                onPress={() => setOpenActionsId(current =>
                  current === document.id ? null : document.id)}
              >
                <MaterialCommunityIcons name="dots-horizontal" size={23} color={COLORS.primary} />
              </Pressable>
            </View>
            {actionsOpen && (
              <View
                style={styles.actionsPanel}
                accessibilityLabel={`Действия с документом ${name}`}
              >
                {action(document, "Переименовать", "pencil-outline", onRename)}
                {action(document, "Поделиться", "share-variant-outline", onShare)}
                {action(document, "Скачать", "download-outline", onDownload)}
                {action(document, "Удалить", "trash-can-outline", onDelete, true)}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: "#E7E3D7",
    borderRadius: 12,
    backgroundColor: "#FBFAF4",
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2DDCF",
    marginLeft: 72,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    paddingRight: 4,
  },
  open: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 9,
    backgroundColor: COLORS.cardBackground,
  },
  fileIcon: {
    width: 50,
    height: 50,
    borderRadius: 9,
    backgroundColor: "#E9EEDC",
    alignItems: "center",
    justifyContent: "center",
  },
  details: { flex: 1, minWidth: 0, gap: 3 },
  name: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.text,
    fontFamily: FONTS.montserratMedium,
  },
  meta: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  moreButton: {
    width: 44,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  moreButtonActive: { backgroundColor: "#E9EEDC" },
  actionsPanel: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 9,
    paddingTop: 2,
    paddingBottom: 10,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2DDCF",
  },
  action: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#F3F0E5",
    paddingHorizontal: 6,
  },
  actionText: {
    color: COLORS.primary,
    fontSize: 11,
    fontFamily: FONTS.montserratMedium,
  },
  dangerText: { color: "#A34743" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
});
