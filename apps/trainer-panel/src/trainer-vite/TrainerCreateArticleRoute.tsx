import { useState, type FormEvent } from "react";
// Import the pure helper, not the Core utils barrel (server logger uses Node process).
import { transliterate } from "../../../../packages/core/src/utils/transliterate";
import { useTrainerAuthoring, type TrainerAuthoringProps } from "./trainerAuthoringClient";
import {
  TrainerFormPage, TrainerFormSection, TrainerFormActions,
  TrainerMarkdownEditor, TrainerMediaUrls,
} from "./live/TrainerFormUI";

/** Next ArticleForm create semantics with Core-side HTML sanitization. */
function slugify(value: string) {
  return transliterate(value)
    .replace(/_/g, "-").replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60) || "article";
}
export function TrainerCreateArticleRoute(p: TrainerAuthoringProps) {
  const authoring = useTrainerAuthoring(p, "/main-panel/articles/new");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [contentType, setContentType] = useState<"TEXT" | "HTML">("HTML");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [logoImg, setLogoImg] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [localError, setLocalError] = useState("");
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authoring.allowed || authoring.phase === "pending") return;
    setLocalError("");
    const normalized = slug.trim() || slugify(title.trim());
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
      setLocalError("Slug может содержать только латинские буквы, цифры и дефисы");
      return;
    }
    if (imageUrls.length > 20 || imageUrls.some(value => {
      try { return !/^https?:$/.test(new URL(value).protocol); }
      catch { return true; }
    })) {
      setLocalError("Допускаются только корректные адреса изображений, максимум 20");
      return;
    }
    void authoring.submit({
      title: title.trim(), slug: normalized, contentType,
      content, visibility: "PAID", description: description.trim(),
      videoUrl: videoUrl.trim() || null, logoImg: logoImg.trim(), imageUrls,
    }, "/api/v1/trainer/authoring/articles");
  };
  if (!authoring.allowed)
    return <main><p role="alert">Создание статьи недоступно</p></main>;
  return <TrainerFormPage title="Создать статью"
    subtitle="Заполните информацию и подготовьте контент публикации"
    backHref="/articles" backLabel="К списку статей">
    <form onSubmit={onSubmit} data-trainer-create-article="hono">
      <TrainerFormSection title="Основная информация">
        <label>Заголовок статьи *
          <input value={title} required maxLength={500}
            placeholder="Название публикации"
            onChange={event => setTitle(event.target.value)} />
        </label>
        <div className="trainer-form-column">
          <label>Адрес статьи (slug)
            <input value={slug} maxLength={100}
              placeholder="article-slug"
              onChange={event => setSlug(event.target.value)} />
          </label>
          <button className="trainer-button-secondary" type="button"
            onClick={() => setSlug(slugify(title))}>Сгенерировать из заголовка</button>
        </div>
        <label>Тип контента
          <select value={contentType}
            onChange={event => setContentType(event.target.value as typeof contentType)}>
            <option value="HTML">HTML</option>
            <option value="TEXT">Текст (Markdown)</option>
          </select>
        </label>
        {contentType === "TEXT"
          ? <TrainerMarkdownEditor label="Контент статьи" required
              value={content} onChange={setContent} rows={15} />
          : <label>Контент (HTML) *
              <textarea required rows={15} value={content} maxLength={2_000_000}
                onChange={event => setContent(event.target.value)} />
            </label>}
      </TrainerFormSection>

      <TrainerFormSection title="Доступ по подписке"
        hint="В текущем API статьи доступны подписчикам. Настройка публичности не поддерживается.">
        <label>Краткое описание статьи *
          <textarea required rows={4} value={description} maxLength={5000}
            onChange={event => setDescription(event.target.value)} />
        </label>
      </TrainerFormSection>

      <TrainerFormSection title="Медиа">
        <label>URL обложки
          <input type="url" value={logoImg} onChange={event => setLogoImg(event.target.value)}
            maxLength={2000} placeholder="https://…" />
        </label>
        {logoImg.startsWith("https://") && <img
          className="trainer-course-cover-preview" src={logoImg}
          alt="Предпросмотр обложки статьи" referrerPolicy="no-referrer" />}
        <label>URL видео
          <input type="url" value={videoUrl} onChange={event => setVideoUrl(event.target.value)}
            maxLength={2000} placeholder="https://…" />
        </label>
        <TrainerMediaUrls label="Дополнительные изображения"
          value={imageUrls} max={20} onChange={setImageUrls} />
      </TrainerFormSection>

      {localError && <p role="alert">{localError}</p>}
      {(authoring.phase === "error" || authoring.phase === "denied") &&
        <p role="alert">{authoring.message}</p>}
      {authoring.phase === "success" &&
        <p role="status">Статья создана. <a href="/articles">К статьям</a></p>}
      <TrainerFormActions>
        <a className="trainer-form-back" href="/articles">Отмена</a>
        <button type="submit" disabled={authoring.phase === "pending" || authoring.phase === "success"}>
          {authoring.phase === "pending" ? "Сохраняем…" : "Создать статью"}
        </button>
      </TrainerFormActions>
    </form>
  </TrainerFormPage>;
}
