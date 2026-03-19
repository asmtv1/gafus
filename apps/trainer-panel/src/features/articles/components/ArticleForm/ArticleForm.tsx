"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Select,
  Typography,
} from "@mui/material";
import { createId } from "@paralleldrive/cuid2";

import {
  createArticleSchema,
  type CreateArticleSchemaInput,
} from "@gafus/core/services/article";
import { transliterate } from "@gafus/core/utils";
import type { TrainerVideoDto } from "@gafus/types";
import type { z } from "zod";
import { createArticleAction, updateArticleAction } from "@shared/lib/actions/articles";
import FormSection from "@shared/components/FormSection";
import { FormField, TextAreaField } from "@shared/components/ui/FormField";
import { MarkdownInput } from "@shared/components/common";
import sharedStyles from "@shared/styles/FormLayout.module.css";

import VideoSelector from "@features/steps/components/VideoSelector";
import ArticleImageUploader from "@features/articles/components/ArticleImageUploader";
import ArticleLogoUploader from "@features/articles/components/ArticleLogoUploader";

/** Генерирует slug: транслитерация кириллицы → латиница, только [a-z0-9-] */
function slugify(text: string): string {
  let s = transliterate(text)
    .replace(/_/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (s.length < 1) s = "article";
  return s;
}

interface ArticleFormProps {
  mode: "create" | "edit";
  articleId?: string;
  initialValues?: Partial<CreateArticleSchemaInput>;
  trainerVideos?: TrainerVideoDto[];
}

export default function ArticleForm({
  mode,
  articleId,
  initialValues,
  trainerVideos = [],
}: ArticleFormProps) {
  const router = useRouter();
  const [draftArticleId] = useState(() => (mode === "create" ? createId() : ""));
  const effectiveArticleId = mode === "edit" ? articleId! : draftArticleId;

  type FormValues = z.input<typeof createArticleSchema>;
  const form = useForm<FormValues>({
    resolver: zodResolver(createArticleSchema),
    mode: "onBlur",
    defaultValues: {
      title: "",
      contentType: "HTML",
      content: "",
      visibility: "PUBLIC",
      priceRub: null,
      videoUrl: "",
      logoImg: "",
      imageUrls: [],
      slug: "",
      description: "",
      ...initialValues,
    },
  });

  const visibility = form.watch("visibility");

  const handleGenerateSlug = () => {
    const title = form.getValues("title");
    if (title?.trim()) {
      form.setValue("slug", slugify(title));
    }
  };

  const handleSubmit = async (data: FormValues) => {
    let slug = (data.slug ?? "").trim();
    if (!slug && data.title?.trim()) {
      slug = slugify(data.title);
      form.setValue("slug", slug);
    }

    const vis = data.visibility ?? "PUBLIC";
    const priceVal = data.priceRub;
    const priceRub =
      vis === "PAID"
        ? typeof priceVal === "number" && !Number.isNaN(priceVal)
          ? priceVal
          : null
        : null;

    const payload: CreateArticleSchemaInput = {
      title: data.title,
      content: data.content,
      slug,
      contentType: data.contentType ?? "HTML",
      visibility: vis,
      logoImg: data.logoImg ?? "",
      imageUrls: data.imageUrls ?? [],
      videoUrl: data.videoUrl || null,
      priceRub,
      description: data.description ?? "",
    };

    if (mode === "edit" && articleId) {
      const result = await updateArticleAction(articleId, payload);
      if (result.success) {
        router.push("/main-panel/articles");
        router.refresh();
      } else {
        form.setError("root", { message: result.error });
      }
    } else {
      const result = await createArticleAction({ ...payload, id: effectiveArticleId });
      if (result.success && result.data) {
        router.push("/main-panel/articles");
        router.refresh();
      } else {
        form.setError("root", { message: result.error ?? "Ошибка создания" });
      }
    }
  };

  return (
    <Box className={sharedStyles.formContainer}>
      {form.formState.errors.root && (
        <Alert
          severity="error"
          className={sharedStyles.formAlert}
          onClose={() => form.clearErrors("root")}
        >
          {form.formState.errors.root.message}
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <FormSection title="Основная информация">
          <FormField
            id="title"
            label="Заголовок *"
            name="title"
            placeholder="Введите заголовок статьи"
            form={form}
            rules={{ required: "Заголовок обязателен" }}
          />
          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
            <FormControl fullWidth sx={{ flex: 1 }} error={!!form.formState.errors.slug}>
              <InputLabel id="slug-label" shrink={!!form.watch("slug")}>
                Slug *
              </InputLabel>
              <Controller
                name="slug"
                control={form.control}
                rules={{ required: "Slug обязателен" }}
                render={({ field }) => (
                  <OutlinedInput
                    id="slug"
                    label="Slug *"
                    placeholder="article-slug"
                    notched={!!field.value}
                    {...field}
                  />
                )}
              />
              {form.formState.errors.slug && (
                <Alert severity="error" sx={{ mt: 0.5 }}>
                  {form.formState.errors.slug.message}
                </Alert>
              )}
            </FormControl>
            <Button
              type="button"
              variant="outlined"
              onClick={handleGenerateSlug}
              sx={{ mt: 1, flexShrink: 0 }}
            >
              Из заголовка
            </Button>
          </Box>
          <FormControl fullWidth margin="normal">
            <InputLabel id="contentType-label">Тип контента</InputLabel>
            <Select
              labelId="contentType-label"
              id="contentType"
              label="Тип контента"
              value={form.watch("contentType")}
              onChange={(e) =>
                form.setValue("contentType", e.target.value as "TEXT" | "HTML")
              }
            >
              <MenuItem value="TEXT">Текст</MenuItem>
              <MenuItem value="HTML">HTML</MenuItem>
            </Select>
          </FormControl>
          {form.watch("contentType") === "TEXT" ? (
            <Box className={sharedStyles.formField} sx={{ mt: 2 }}>
              <Typography className={sharedStyles.formLabel}>Контент (Markdown) *</Typography>
              <Controller
                name="content"
                control={form.control}
                rules={{ required: "Контент обязателен" }}
                render={({ field }) => (
                  <MarkdownInput value={field.value} onChange={field.onChange} />
                )}
              />
              {form.formState.errors.content && (
                <Alert severity="error" className={sharedStyles.formAlert}>
                  {form.formState.errors.content.message}
                </Alert>
              )}
            </Box>
          ) : (
            <TextAreaField
              id="content"
              label="Контент (HTML) *"
              name="content"
              placeholder="HTML-разметка"
              form={form}
              rows={15}
              rules={{ required: "Контент обязателен" }}
            />
          )}
        </FormSection>

        <FormSection title="Видимость и оплата">
          <FormControl fullWidth margin="normal">
            <InputLabel id="visibility-label">Видимость</InputLabel>
            <Select
              labelId="visibility-label"
              id="visibility"
              label="Видимость"
              value={form.watch("visibility")}
              onChange={(e) =>
                form.setValue("visibility", e.target.value as "PUBLIC" | "PAID")
              }
            >
              <MenuItem value="PUBLIC">Публичная</MenuItem>
              <MenuItem value="PAID">Платная</MenuItem>
            </Select>
          </FormControl>
          {visibility === "PAID" && (
            <>
              <TextAreaField
                id="description"
                label="Описание *"
                name="description"
                placeholder="Описание для превью платной статьи (отображается вместо «В курс входит»)"
                form={form}
                rows={4}
                rules={{
                  required: visibility === "PAID" ? "Описание обязательно для платной статьи" : false,
                }}
              />
              <FormField
                id="priceRub"
                label="Цена (₽) *"
                name="priceRub"
                type="number"
                form={form}
                rules={{
                  setValueAs: (v: unknown) =>
                    v === "" || v === undefined ? null : Number(v),
                }}
              />
            </>
          )}
        </FormSection>

        <FormSection title="Медиа">
          <ArticleLogoUploader
            value={form.watch("logoImg") ?? ""}
            onChange={(url) => form.setValue("logoImg", url)}
            articleId={effectiveArticleId}
          />
          <Box sx={{ mb: 2 }}>
            <VideoSelector
              value={form.watch("videoUrl")}
              onChange={(value) => form.setValue("videoUrl", value)}
              trainerVideos={trainerVideos}
              error={form.formState.errors.videoUrl?.message}
              helperText="Выберите видео из библиотеки или укажите внешнюю ссылку"
            />
          </Box>
          <ArticleImageUploader
            value={form.watch("imageUrls") ?? []}
            onChange={(urls) => form.setValue("imageUrls", urls)}
            articleId={effectiveArticleId}
            maxImages={10}
          />
        </FormSection>

        <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
          <Button
            type="submit"
            variant="contained"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Сохранение..." : "Сохранить"}
          </Button>
          <Button
            type="button"
            variant="outlined"
            onClick={() => router.push("/main-panel/articles")}
          >
            Отмена
          </Button>
        </Box>
      </form>
    </Box>
  );
}
