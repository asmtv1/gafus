import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  QUESTION_CATEGORIES,
  QUESTION_LIMITS,
  type QuestionCategory,
  type QuestionDetailDto,
  type QuestionPhotoDto,
} from "@gafus/types";
import { PageHeader, TexturedSafeAreaView } from "@/shared/components";
import { useAuthStore } from "@/shared/stores";
import { questionsApi } from "@/shared/lib/api/questions";
import { QButton, QInput, QPhotoPicker, st } from "./ui";
function Form({ initial }: { initial?: QuestionDetailDto }) {
  const router = useRouter();
  const cache = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [category, setCategory] = useState<QuestionCategory>(initial?.category ?? "Другое");
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
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={st.content}>
          <QButton label="Назад" secondary icon="arrow-left" onPress={() => router.back()} />
          <PageHeader
            title={initial ? "Изменить вопрос" : "Задать вопрос"}
            description="Опишите ситуацию и что уже пробовали"
          />
          <View style={st.card}>
            <QInput
              label="Заголовок"
              value={title}
              onChange={setTitle}
              maxLength={QUESTION_LIMITS.title}
              placeholder="Что вы хотите узнать?"
            />
            <QInput
              label="Подробности"
              value={body}
              onChange={setBody}
              multiline
              maxLength={QUESTION_LIMITS.body}
            />
            <Text style={st.label}>Категория</Text>
            <View style={st.row}>
              {QUESTION_CATEGORIES.map((c) => (
                <QButton
                  key={c}
                  label={c}
                  secondary
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
            <QInput
              label="Теги через запятую · до 5"
              value={tags}
              onChange={setTags}
              maxLength={180}
              placeholder="щенок, прогулка, поводок"
            />
            <QPhotoPicker photos={photos} onChange={setPhotos} onBusy={setUploading} />
            {error && (
              <Text accessibilityRole="alert" style={st.error}>
                {error}
              </Text>
            )}
            <QButton
              label={busy ? "Сохранение…" : initial ? "Сохранить изменения" : "Опубликовать вопрос"}
              disabled={busy || uploading || !title.trim() || !body.trim()}
              onPress={() => void submit()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
        <Text style={st.notice}>Загрузка вопроса…</Text>
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
