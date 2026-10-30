import { useState, type FormEvent } from "react";
// Import the pure helper, not the Core utils barrel (server logger uses Node process).
import { transliterate } from "../../../../packages/core/src/utils/transliterate";
import { useTrainerAuthoring, type TrainerAuthoringProps } from "./trainerAuthoringClient";

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
  const [imageUrlText, setImageUrlText] = useState("");
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
    const imageUrls = imageUrlText.split(/\s*[,\n]\s*/).map(item => item.trim()).filter(Boolean);
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
  return <main data-trainer-create-article="hono">
    <h1>Создать статью</h1>
    <p>Заполните поля для новой статьи</p>
    <form onSubmit={onSubmit}>
      <label>Заголовок *
        <input value={title} required maxLength={500}
          onChange={e => setTitle(e.target.value)} />
      </label>
      <label>Slug *
        <input value={slug} maxLength={100} onChange={e => setSlug(e.target.value)} />
      </label>
      <button type="button" onClick={() => setSlug(slugify(title))}>Из заголовка</button>
      <label>Тип контента
        <select value={contentType}
          onChange={e => setContentType(e.target.value as typeof contentType)}>
          <option value="TEXT">Текст (Markdown)</option>
          <option value="HTML">HTML</option>
        </select>
      </label>
      <label>{contentType === "TEXT" ? "Контент (Markdown) *" : "Контент (HTML) *"}
        <textarea required value={content} maxLength={2_000_000}
          onChange={e => setContent(e.target.value)} />
      </label>
      <fieldset><legend>Доступ по подписке</legend>
        <p>Все статьи доступны подписчикам. Отдельная стоимость не задаётся.</p>
        <label>Описание *
          <textarea required value={description} maxLength={5000}
            onChange={e => setDescription(e.target.value)} />
        </label>
      </fieldset>
      <fieldset><legend>Медиа</legend>
        <label>Адрес логотипа
          <input value={logoImg} onChange={e => setLogoImg(e.target.value)} maxLength={2000} />
        </label>
        <label>Адрес видео
          <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} maxLength={2000} />
        </label>
        <label>Адреса изображений (через запятую или строку)
          <textarea value={imageUrlText} onChange={e => setImageUrlText(e.target.value)} />
        </label>
      </fieldset>
      {localError && <p role="alert">{localError}</p>}
      {(authoring.phase === "error" || authoring.phase === "denied") &&
        <p role="alert">{authoring.message}</p>}
      {authoring.phase === "success" &&
        <p role="status">Статья создана. <a href="/main-panel/articles">К статьям</a></p>}
      <button type="submit" disabled={authoring.phase === "pending" || authoring.phase === "success"}>
        {authoring.phase === "pending" ? "Сохраняем…" : "Создать статью"}
      </button>
    </form>
  </main>;
}
