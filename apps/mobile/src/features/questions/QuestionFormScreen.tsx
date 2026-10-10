import { useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import {
  QUESTION_CATEGORIES,
  QUESTION_LIMITS,
  type QuestionCategory,
  type QuestionDetailDto,
  type QuestionPhotoDto,
} from "@gafus/types";
import { Loading, TexturedSafeAreaView } from "@/shared/components";
import { Button } from "@/shared/components/ui/Button";
import { COLORS, FONTS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { questionsApi } from "@/shared/lib/api/questions";
import { QPhotoPicker, st } from "./ui";
function Form({ initial }: { initial?: QuestionDetailDto }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cache = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [category, setCategory] = useState<QuestionCategory>(initial?.category ?? "Другое");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(Boolean(initial?.tags.length));
  const [photos, setPhotos] = useState<QuestionPhotoDto[]>(initial?.photos ?? []);
  const [requestId] = useState(() => Crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy || uploading) return;
    setBusy(true);
    setError("");
    const input = {
      title,
      body,
      category,
      tags: tags
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean),
      photoIds: photos.map((p) => p.id),
    };
    try {
      const id = initial
        ? (await questionsApi.edit(initial.id, input), initial.id)
        : (await questionsApi.create({ ...input, clientRequestId: requestId })).id;
      await cache.invalidateQueries({ queryKey: ["questions"] });
      router.replace(`/questions/${id}` as Href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить вопрос");
    } finally {
      setBusy(false);
    }
  };
  return (
    <TexturedSafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Назад" hitSlop={6}
              style={styles.backButton} onPress={() => router.back()}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.primary} />
            </Pressable>
            <Text accessibilityRole="header" style={styles.heading}>
              {initial ? "Изменить вопрос" : "Задать вопрос"}
            </Text>
          </View>
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Заголовок</Text>
              <TextInput
                accessibilityLabel="Заголовок"
                value={title}
                onChangeText={setTitle}
                maxLength={QUESTION_LIMITS.title}
                placeholder="Что вы хотите узнать?"
                placeholderTextColor={COLORS.textSecondary}
                returnKeyType="next"
                style={[styles.input, styles.titleInput]}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Подробности</Text>
              <TextInput
                accessibilityLabel="Подробности"
                value={body}
                onChangeText={setBody}
                multiline
                scrollEnabled={false}
                maxLength={QUESTION_LIMITS.body}
                placeholder="Опишите ситуацию и что уже пробовали"
                placeholderTextColor={COLORS.textSecondary}
                style={[styles.input, styles.detailsInput]}
              />
            </View>
            <View style={styles.optionsRow}>
              <View style={styles.categoryField}>
                <Text style={styles.label}>Категория</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Категория: ${category}. Изменить`}
                  onPress={() => { Keyboard.dismiss(); setCategoryOpen(true); }}
                  style={styles.categoryButton}
                >
                  <Text numberOfLines={1} style={styles.categoryText}>{category}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={COLORS.primary} />
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={tagsOpen ? "Скрыть поле тегов" : "Добавить теги"}
                accessibilityState={{ expanded: tagsOpen }}
                onPress={() => setTagsOpen(value => !value)} style={styles.tagsButton}>
                <MaterialCommunityIcons name={tagsOpen ? "tag" : "tag-plus-outline"} size={18} color={COLORS.primary} />
                <Text style={styles.tagsButtonText}>Теги{tags.trim() ? " ✓" : ""}</Text>
              </Pressable>
            </View>
            {tagsOpen && <View style={styles.field}>
              <Text style={styles.label}>Теги · до 5 через запятую</Text>
              <TextInput
                accessibilityLabel="Теги через запятую, до пяти"
                value={tags}
                onChangeText={setTags}
                maxLength={180}
                placeholder="щенок, прогулка, поводок"
                placeholderTextColor={COLORS.textSecondary}
                style={[styles.input, styles.titleInput]}
              />
            </View>}
            <QPhotoPicker photos={photos} onChange={setPhotos} onBusy={setUploading} compact />
            {error && (
              <Text accessibilityRole="alert" style={st.error}>
                {error}
              </Text>
            )}
            <Button
              label={busy ? "Сохранение…" : initial ? "Сохранить изменения" : "Опубликовать вопрос"}
              variant="primary"
              height={46}
              fontSize={15}
              lineHeight={20}
              borderRadius={14}
              animatedPress
              disabled={busy || uploading || !title.trim() || !body.trim()}
              onPress={() => void submit()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal
        visible={categoryOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button"
            accessibilityLabel="Закрыть выбор категории" onPress={() => setCategoryOpen(false)} />
          <View style={[styles.categorySheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetHeading}>Категория вопроса</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Закрыть"
                hitSlop={8} onPress={() => setCategoryOpen(false)}>
                <MaterialCommunityIcons name="close" size={23} color={COLORS.text} />
              </Pressable>
            </View>
            {QUESTION_CATEGORIES.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: category === value }}
                accessibilityLabel={value}
                onPress={() => { setCategory(value); setCategoryOpen(false); }}
                style={[styles.categoryChoice, category === value && styles.categoryChoiceSelected]}
              >
                <Text style={styles.choiceText}>{value}</Text>
                {category === value && <MaterialCommunityIcons name="check" size={20} color={COLORS.primary} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </TexturedSafeAreaView>
  );
}
export function QuestionFormScreen({ id }: { id?: string }) {
  const userId = useAuthStore((s) => s.user?.id);
  const query = useQuery({
    queryKey: ["questions", userId, "edit", id],
    queryFn: () => questionsApi.detail(id!),
    enabled: !!id && !!userId,
  });
  if (!id) return <Form />;
  if (query.isPending)
    return (
      <TexturedSafeAreaView style={{ flex: 1 }}>
        <Loading fullScreen embedded message="Загрузка вопроса…" />
      </TexturedSafeAreaView>
    );
  if (query.isError || !query.data?.canEdit || query.data.blockReason)
    return (
      <TexturedSafeAreaView style={{ flex: 1 }}>
        <Text style={st.error}>{query.error?.message ?? "Редактирование недоступно"}</Text>
      </TexturedSafeAreaView>
    );
  return <Form initial={query.data} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 40, gap: 10 },
  header: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
  backButton: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, fontFamily: FONTS.montserratMedium, fontSize: 20, lineHeight: 28, color: COLORS.text },
  form: { padding: 14, borderRadius: 16, backgroundColor: COLORS.cardBackground, gap: 14 },
  field: { gap: 6 },
  label: { fontFamily: FONTS.montserratMedium, fontSize: 13, lineHeight: 19, color: COLORS.text },
  input: {
    borderWidth: 1, borderColor: "#aaa791", borderRadius: 11, paddingHorizontal: 12,
    backgroundColor: "#faf7ef", color: COLORS.text, fontFamily: FONTS.montserrat, fontSize: 14,
  },
  titleInput: { height: 46, paddingVertical: 0, textAlignVertical: "center", includeFontPadding: false },
  detailsInput: { minHeight: 124, paddingVertical: 11, lineHeight: 21, textAlignVertical: "top" },
  optionsRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  categoryField: { flex: 1, minWidth: 0, gap: 6 },
  categoryButton: {
    height: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", gap: 6, borderWidth: 1, borderColor: "#aaa791",
    borderRadius: 11, backgroundColor: "#faf7ef",
  },
  categoryText: { flex: 1, fontFamily: FONTS.montserratMedium, fontSize: 13, color: COLORS.text },
  tagsButton: { height: 44, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, borderRadius: 10 },
  tagsButtonText: { fontFamily: FONTS.montserratMedium, fontSize: 13, color: COLORS.primary },
  modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.32)" },
  categorySheet: { paddingHorizontal: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: "#faf7ef" },
  sheetHandle: { alignSelf: "center", width: 36, height: 4, backgroundColor: "#c3c0b4", borderRadius: 2, marginTop: 9, marginBottom: 10 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12 },
  sheetHeading: { fontFamily: FONTS.montserratBold, fontSize: 17, color: COLORS.text },
  categoryChoice: { minHeight: 48, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, borderRadius: 11 },
  categoryChoiceSelected: { backgroundColor: "#dfe6ce" },
  choiceText: { fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.text },
});
