import { questionThumbnailUrl } from "@gafus/types";
import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View, Linking, Alert, FlatList, Modal, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { uploadQuestionPhoto, discardQuestionPhoto } from "@/shared/lib/api/questions";
import { questionAuthorProfileIdentifier } from "./profileLink";
import {
  QUESTION_LIMITS,
  type QuestionAuthorDto,
  type QuestionListItemDto,
  type QuestionPhotoDto,
} from "@gafus/types";
export function QButton({
  label,
  onPress,
  disabled,
  secondary,
  selected,
  icon,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  selected?: boolean;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      hitSlop={compact ? 4 : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        st.button,
        secondary && st.secondary,
        selected && st.selected,
        compact && st.compactButton,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={compact ? 16 : 20}
          color={secondary ? COLORS.primary : "#fff"}
        />
      )}
      <Text
        style={[
          st.buttonText,
          compact && st.compactButtonText,
          secondary && { color: COLORS.primary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function QAuthor({
  author,
  date,
  edited,
  compact = false,
  listStats,
}: {
  author: QuestionAuthorDto;
  date: string;
  edited?: string | null;
  compact?: boolean;
  listStats?: string;
}) {
  const router = useRouter();
  const viewer = useAuthStore((state) => state.user);
  const profileIdentifier = questionAuthorProfileIdentifier(author, viewer);
  const openProfile = () => {
    if (profileIdentifier) {
      router.push({ pathname: "/profile/[username]", params: { username: profileIdentifier } });
    }
  };
  const avatar = author.avatarUrl ? (
    <Image
      source={{ uri: author.avatarUrl }}
      style={[st.avatar, (compact || listStats !== undefined) && st.compactAvatar]}
      contentFit="cover"
    />
  ) : (
    <View style={[st.avatar, st.initial, (compact || listStats !== undefined) && st.compactAvatar]}>
      <Text style={st.label}>{author.name.slice(0, 1)}</Text>
    </View>
  );
  const nameAndDate = (
    <>
      <Text style={[st.label, compact && st.compactName]} numberOfLines={compact ? 1 : undefined}>
        {author.name}
      </Text>
      <Text style={[st.meta, compact && st.compactDate]}>
        {new Date(date).toLocaleDateString("ru-RU")}
        {edited && " · Изменено"}
      </Text>
    </>
  );
  // Question lists show author, date and activity in a compact two-line footer.
  if (listStats !== undefined) {
    return (
      <View style={st.listAuthor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Открыть профиль ${author.name}`}
          disabled={!profileIdentifier}
          hitSlop={6}
          onPress={(event) => {
            event.stopPropagation();
            openProfile();
          }}
        >
          {avatar}
        </Pressable>
        <View style={st.listAuthorInfo}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Открыть профиль ${author.name}`}
            disabled={!profileIdentifier}
            hitSlop={4}
            onPress={(event) => {
              event.stopPropagation();
              openProfile();
            }}
          >
            <Text style={st.listName} numberOfLines={1}>{author.name}</Text>
          </Pressable>
          <Text style={st.listMeta} numberOfLines={2}>
            {new Date(date).toLocaleDateString("ru-RU")} · {listStats}
          </Text>
        </View>
      </View>
    );
  }
  // Instagram-style threads: the avatar remains on the left, while the body
  // starts directly below the one-line name/date rather than below the avatar.
  if (compact) {
    return (
      <View style={st.compactAuthor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Открыть профиль ${author.name}`}
          disabled={!profileIdentifier}
          hitSlop={5}
          style={st.compactAvatarTap}
          onPress={(event) => {
            event.stopPropagation();
            openProfile();
          }}
        >
          {avatar}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Открыть профиль ${author.name}`}
          disabled={!profileIdentifier}
          style={st.compactAuthorInfo}
          onPress={(event) => {
            event.stopPropagation();
            openProfile();
          }}
        >
          {nameAndDate}
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable
      style={st.author}
      accessibilityRole="button"
      accessibilityLabel={`Открыть профиль ${author.name}`}
      disabled={!profileIdentifier}
      onPress={(event) => {
        event.stopPropagation();
        openProfile();
      }}
    >
      {avatar}
      <View style={st.authorInfo}>{nameAndDate}</View>
    </Pressable>
  );
}
export function QStatus({ question, compact = false }: { question: QuestionListItemDto; compact?: boolean }) {
  return (
    <View style={[st.row, compact && st.listTags]}>
      <Text
        style={[
          st.badge,
          compact && st.listBadge,
          question.status === "resolved"
            ? st.resolved
            : question.status === "answered"
              ? st.answered
              : null,
        ]}
      >
        {question.status === "resolved"
          ? "Решён"
          : question.status === "answered"
            ? "Есть ответы"
            : "Ждёт ответа"}
      </Text>
      {question.closed && <Text style={[st.badge, compact && st.listBadge]}>Закрыто</Text>}
      <Text style={[st.tag, compact && st.listTag]}>{question.category}</Text>
      {question.tags.map((tag) => (
        <Text key={tag} style={[st.tag, compact && st.listTag]}>
          #{tag}
        </Text>
      ))}
    </View>
  );
}
export function QPhotos({ photos }: { photos: QuestionPhotoDto[] }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const closeViewer = () => setViewerIndex(null);

  return (
    <>
      <View style={st.row}>
        {photos.map((p, index) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Открыть фото ${index + 1} из ${photos.length}`}
            key={p.id}
            onPress={() => setViewerIndex(index)}
          >
            <Image source={{ uri: questionThumbnailUrl(p.url) }} contentFit="cover" style={st.photo} />
          </Pressable>
        ))}
      </View>
      {viewerIndex !== null && (
        <Modal
          visible
          animationType="fade"
          onRequestClose={closeViewer}
          supportedOrientations={["portrait", "landscape"]}
        >
          <StatusBar hidden />
          <SafeAreaProvider>
            <SafeAreaView edges={["top", "bottom"]} style={st.questionPhotoViewer}>
            <View style={st.questionPhotoViewerHeader}>
              <Text style={st.questionPhotoViewerCount}>
                {viewerIndex + 1} / {photos.length}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть просмотр фотографии"
                hitSlop={8}
                onPress={closeViewer}
                style={st.questionPhotoViewerClose}
              >
                <MaterialCommunityIcons name="close" size={26} color="#fff" />
              </Pressable>
            </View>
            <FlatList
              key={width}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              data={photos}
              initialScrollIndex={Math.min(viewerIndex, photos.length - 1)}
              keyExtractor={(photo) => photo.id}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              onMomentumScrollEnd={(event) => {
                setViewerIndex(
                  Math.max(0, Math.min(photos.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))),
                );
              }}
              renderItem={({ item, index }) => (
                <View style={[st.questionPhotoViewerPage, { width }]}>
                  <Image
                    source={{ uri: item.url }}
                    contentFit="contain"
                    style={st.questionPhotoViewerImage}
                    accessibilityLabel={`Фото ${index + 1} из ${photos.length}`}
                  />
                </View>
              )}
            />
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      )}
    </>
  );
}
export function QBody({
  text,
  compact = false,
  replyToName,
}: {
  text: string;
  compact?: boolean;
  replyToName?: string | null;
}) {
  return (
    <Text style={[st.body, compact && st.compactBody]}>
      {replyToName && <Text style={st.inlineReplyTo}>В ответ {replyToName}: </Text>}
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <Text
            key={i}
            accessibilityRole="link"
            style={{ color: COLORS.primary, textDecorationLine: "underline" }}
            onPress={() => void Linking.openURL(part)}
          >
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}
export function QPhotoPicker({
  photos,
  onChange,
  onBusy,
  compact = false,
  trailingAction,
}: {
  photos: QuestionPhotoDto[];
  onChange: (photos: QuestionPhotoDto[]) => void;
  onBusy: (busy: boolean) => void;
  compact?: boolean;
  trailingAction?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = async () => {
    setError("");
    setBusy(true);
    onBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Доступ к фото", "Разрешите доступ к библиотеке в настройках телефона.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: QUESTION_LIMITS.photos - photos.length,
        quality: 1,
      });
      if (result.canceled) return;
      if (result.assets.length + photos.length > QUESTION_LIMITS.photos) {
        setError("Можно прикрепить до 5 фото");
        return;
      }
      const next = [...photos];
      for (const asset of result.assets) {
        const image = await manipulateAsync(
          asset.uri,
          asset.width > 1600 ? [{ resize: { width: 1600 } }] : [],
          { compress: 0.85, format: SaveFormat.JPEG },
        );
        next.push(await uploadQuestionPhoto(image.uri));
        onChange([...next]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить фото");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <View style={[st.group, compact && st.compactPhotoPicker]}>
      {photos.length > 0 && <View style={st.row}>
        {photos.map((p) => (
          <View key={p.id}>
            <Image source={{ uri: questionThumbnailUrl(p.url) }} contentFit="cover" style={[st.photo, compact && st.compactPhoto]} />
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Убрать фото"
              hitSlop={compact ? 8 : undefined}
              style={[st.removePhoto, compact && st.compactRemovePhoto]}
              onPress={() => {
                onChange(photos.filter((x) => x.id !== p.id));
                void discardQuestionPhoto(p.id).catch(() => undefined);
              }}
            >
              <MaterialCommunityIcons name="close" size={compact ? 16 : 22} color={COLORS.text} />
            </Pressable>
          </View>
        ))}
      </View>}
      {compact ? (
        <View style={st.compactPhotoToolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Прикрепить фото"
            accessibilityHint="До 5 фото, до 10 МБ каждое"
            accessibilityState={{ disabled: busy || photos.length >= QUESTION_LIMITS.photos }}
            disabled={busy || photos.length >= QUESTION_LIMITS.photos}
            onPress={() => void pick()}
            style={({ pressed }) => [
              st.compactPhotoAction,
              (pressed || busy || photos.length >= QUESTION_LIMITS.photos) && { opacity: 0.6 },
            ]}
          >
            <MaterialCommunityIcons name="image-plus-outline" size={19} color={COLORS.primary} />
            <Text style={st.compactPhotoText}>{busy ? "Загрузка…" : "Фото"}</Text>
            <Text style={st.compactPhotoHint}>{photos.length}/{QUESTION_LIMITS.photos} · 10 МБ</Text>
          </Pressable>
          {trailingAction}
        </View>
      ) : (
        <>
          <QButton
            label={busy ? "Загрузка фото…" : "Прикрепить фото"}
            secondary
            icon="image-plus"
            disabled={busy || photos.length >= QUESTION_LIMITS.photos}
            onPress={() => void pick()}
          />
          <Text style={st.meta}>До 5 фото · до 10 МБ каждое</Text>
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" style={st.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
export function QInput({
  label,
  value,
  onChange,
  multiline,
  minHeight,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  multiline?: boolean;
  minHeight?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <View style={st.group}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        scrollEnabled={multiline ? false : undefined}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor="#6a655b"
        style={[
          st.input,
          multiline
            ? { minHeight: minHeight ?? 140, lineHeight: 24, textAlignVertical: "top" }
            : st.singleLineInput,
        ]}
      />
    </View>
  );
}
export const st = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  questionPhotoViewer: { flex: 1, backgroundColor: "#101010" },
  questionPhotoViewerHeader: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  questionPhotoViewerCount: { color: "#fff", fontFamily: FONTS.montserratMedium, fontSize: 14 },
  questionPhotoViewerClose: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  questionPhotoViewerPage: { flex: 1, paddingHorizontal: 12, justifyContent: "center" },
  questionPhotoViewerImage: { flex: 1, width: "100%" },
  group: { gap: 8 },
  compactPhotoPicker: { gap: 8 },
  compactPhotoToolbar: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  compactPhotoAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  compactPhotoText: { fontFamily: FONTS.montserratMedium, fontSize: 13, color: COLORS.primary },
  compactPhotoHint: { fontFamily: FONTS.montserrat, fontSize: 11, color: COLORS.textSecondary },
  compactPhoto: { width: 64, height: 64, borderRadius: 8 },
  compactRemovePhoto: { width: 26, height: 26, borderRadius: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  card: { backgroundColor: COLORS.cardBackground, borderRadius: 16, padding: 18, gap: 16 },
  listCard: { padding: 12, gap: 8, borderRadius: 14 },
  listTitle: {
    fontFamily: FONTS.montserratBold,
    fontSize: 17,
    lineHeight: 24,
    color: COLORS.text,
  },
  listPreview: { backgroundColor: "#e3ead7", padding: 9, borderRadius: 9, gap: 3 },
  listTags: { gap: 6, rowGap: 4 },
  listBadge: { paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, lineHeight: 16 },
  listTag: { paddingHorizontal: 0, paddingVertical: 2, fontSize: 11, lineHeight: 17 },
  listAuthor: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32 },
  listAuthorInfo: { flex: 1, minWidth: 0, gap: 1 },
  listName: { fontFamily: FONTS.montserratMedium, fontSize: 12, lineHeight: 17, color: COLORS.text },
  listMeta: { fontFamily: FONTS.montserrat, fontSize: 11, lineHeight: 16, color: "#5b564b" },
  title: { fontFamily: FONTS.montserratBold, fontSize: 22, lineHeight: 31, color: COLORS.text },
  body: { fontFamily: FONTS.montserrat, fontSize: 15, lineHeight: 25, color: COLORS.text },
  compactBody: { fontSize: 14, lineHeight: 21 },
  inlineReplyTo: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.textSecondary },
  label: { fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.text },
  meta: { fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 19, color: "#5b564b" },
  badge: {
    backgroundColor: "#e7dfc4",
    color: "#66521c",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: FONTS.montserratMedium,
    fontSize: 11,
  },
  answered: { backgroundColor: "#e0e7ed", color: "#304f66" },
  resolved: { backgroundColor: "#dfe8d2", color: "#3b4822" },
  tag: { color: "#57564d", fontFamily: FONTS.montserrat, fontSize: 11, padding: 6 },
  button: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  compactButton: {
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    gap: 5,
  },
  secondary: { backgroundColor: "transparent", borderColor: "#b0ad9c", borderWidth: 1 },
  selected: { backgroundColor: "#e1e6d0", borderColor: COLORS.primary },
  buttonText: { fontFamily: FONTS.montserratMedium, color: "#fff", fontSize: 13 },
  compactButtonText: { fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#aaa791",
    borderRadius: 10,
    padding: 12,
    minHeight: 46,
    backgroundColor: "#faf7ef",
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    fontSize: 15,
  },
  singleLineInput: {
    // Preserve the former 24px line + 24px padding + 2px border height.
    height: 50,
    paddingVertical: 0,
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  author: { flexDirection: "row", gap: 10, alignItems: "center" },
  compactAuthor: { minHeight: 32, position: "relative" },
  compactAvatarTap: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 32,
    height: 32,
  },
  authorInfo: { flex: 1 },
  compactAuthorInfo: {
    minHeight: 22,
    marginLeft: 40,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 6,
  },
  compactName: { fontFamily: FONTS.montserratBold, fontSize: 13, flexShrink: 1 },
  compactDate: { fontSize: 11, lineHeight: 17 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  compactAvatar: { width: 32, height: 32, borderRadius: 16 },
  initial: { backgroundColor: "#e1e6d0", alignItems: "center", justifyContent: "center" },
  photo: { width: 110, height: 110, borderRadius: 10 },
  removePhoto: {
    position: "absolute",
    right: 2,
    top: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#faf7ef",
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    color: "#9e2933",
    backgroundColor: "#f4e4df",
    padding: 14,
    borderRadius: 10,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    lineHeight: 22,
  },
  notice: {
    color: COLORS.text,
    backgroundColor: "#e7e3d5",
    padding: 14,
    borderRadius: 10,
    fontFamily: FONTS.montserrat,
    fontSize: 14,
    lineHeight: 22,
  },
  answer: { paddingVertical: 18, borderTopWidth: 1, borderColor: "#d5d1c0", gap: 12 },
  reply: { marginLeft: 16, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: "#b6bea0" },
  best: { backgroundColor: "#e6eddc", borderRadius: 12, padding: 14 },
});