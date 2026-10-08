import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, Linking, Alert } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { COLORS, FONTS } from "@/shared/config";
import { uploadQuestionPhoto, discardQuestionPhoto } from "@/shared/lib/api/questions";
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
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  selected?: boolean;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        st.button,
        secondary && st.secondary,
        selected && st.selected,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {icon && (
        <MaterialCommunityIcons name={icon} size={20} color={secondary ? COLORS.primary : "#fff"} />
      )}
      <Text style={[st.buttonText, secondary && { color: COLORS.primary }]}>{label}</Text>
    </Pressable>
  );
}
export function QAuthor({
  author,
  date,
  edited,
}: {
  author: QuestionAuthorDto;
  date: string;
  edited?: string | null;
}) {
  return (
    <View style={st.author}>
      {author.avatarUrl ? (
        <Image source={{ uri: author.avatarUrl }} style={st.avatar} contentFit="cover" />
      ) : (
        <View style={[st.avatar, st.initial]}>
          <Text style={st.label}>{author.name.slice(0, 1)}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={st.label}>{author.name}</Text>
        <Text style={st.meta}>
          {new Date(date).toLocaleDateString("ru-RU")}
          {edited && " · Изменено"}
        </Text>
      </View>
    </View>
  );
}
export function QStatus({ question }: { question: QuestionListItemDto }) {
  return (
    <View style={st.row}>
      <Text
        style={[
          st.badge,
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
      {question.closed && <Text style={st.badge}>Закрыто</Text>}
      <Text style={st.tag}>{question.category}</Text>
      {question.tags.map((tag) => (
        <Text key={tag} style={st.tag}>
          #{tag}
        </Text>
      ))}
    </View>
  );
}
export function QPhotos({ photos }: { photos: QuestionPhotoDto[] }) {
  return (
    <View style={st.row}>
      {photos.map((p) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть фото"
          key={p.id}
          onPress={() => void Linking.openURL(p.url)}
        >
          <Image source={{ uri: p.url }} contentFit="cover" style={st.photo} />
        </Pressable>
      ))}
    </View>
  );
}
export function QBody({ text }: { text: string }) {
  return (
    <Text style={st.body}>
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
}: {
  photos: QuestionPhotoDto[];
  onChange: (photos: QuestionPhotoDto[]) => void;
  onBusy: (busy: boolean) => void;
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
    <View style={st.group}>
      <View style={st.row}>
        {photos.map((p) => (
          <View key={p.id}>
            <Image source={{ uri: p.url }} contentFit="cover" style={st.photo} />
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Убрать фото"
              style={st.removePhoto}
              onPress={() => {
                onChange(photos.filter((x) => x.id !== p.id));
                void discardQuestionPhoto(p.id).catch(() => undefined);
              }}
            >
              <MaterialCommunityIcons name="close" size={22} color={COLORS.text} />
            </Pressable>
          </View>
        ))}
      </View>
      <QButton
        label={busy ? "Загрузка фото…" : "Прикрепить фото"}
        secondary
        icon="image-plus"
        disabled={busy || photos.length >= QUESTION_LIMITS.photos}
        onPress={() => void pick()}
      />
      <Text style={st.meta}>До 5 фото · до 10 МБ каждое</Text>
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
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  multiline?: boolean;
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
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor="#6a655b"
        style={[st.input, multiline && { minHeight: 140, textAlignVertical: "top" }]}
      />
    </View>
  );
}
export const st = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  group: { gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  card: { backgroundColor: COLORS.cardBackground, borderRadius: 16, padding: 18, gap: 16 },
  title: { fontFamily: FONTS.montserratBold, fontSize: 22, lineHeight: 31, color: COLORS.text },
  body: { fontFamily: FONTS.montserrat, fontSize: 15, lineHeight: 25, color: COLORS.text },
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
  secondary: { backgroundColor: "transparent", borderColor: "#b0ad9c", borderWidth: 1 },
  selected: { backgroundColor: "#e1e6d0", borderColor: COLORS.primary },
  buttonText: { fontFamily: FONTS.montserratMedium, color: "#fff", fontSize: 13 },
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
    lineHeight: 24,
  },
  author: { flexDirection: "row", gap: 10, alignItems: "center" },
  avatar: { width: 36, height: 36, borderRadius: 18 },
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
