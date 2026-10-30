import { Loading } from "../../shared/ui";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {PrimaryButtonLink, SecondaryButton} from "../../shared/ui";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import { useRouteSearch } from "../../shared/router/location";
import { getMyProfile, uploadMyAvatar, type ProfileOverview as Profile } from "./profileApi";
import { getPublicProfileSummary, publicImageUrl } from "./publicProfileApi";
// Keep existing App code-splitting for the heavy feed/questions modules.
import { EmbeddedProfileActivity } from "./EmbeddedProfileActivity";
const MyQuestionsPanel = lazy(() =>
  import("../questions/MyQuestionsPanel").then((module) => ({ default: module.MyQuestionsPanel })),
);
const WalletConnectedPanel = lazy(() =>
  import("../gafus/WalletConnectedPanel").then((module) => ({
    default: module.WalletConnectedPanel,
  })),
);
import { StudentNotesPanel } from "./StudentNotesPanel";
import { LegacyProfileSettings } from "./LegacyProfileSettings";
import { LegacyPremiumConnectedCard } from "./LegacyPremiumConnectedCard";
import { NextProfileIcon } from "./NextProfileIcon";
import {
  InstagramIcon, TelegramIcon, WebsiteIcon, YouTubeIcon, isYouTubeWebsite,
} from "./NextSocialIcons";
import { getTelegramUrl, getInstagramUrl } from "@gafus/core-client/utils/social";
import { getAge } from "@gafus/core-client/utils/age/getAge";
import { declOfNum } from "@gafus/core-client/utils/pluralize";
import page from "../../brand/LegacyProfilePage.module.css";
import bio from "../../brand/LegacyProfileBio.module.css";
import editor from "./NextProfileAvatarEditor.module.css";
import {PrimaryButton} from "../../shared/ui";

type Section = "activity" | "questions" | "settings" | "notes" | "gafus";
const sections: readonly { id: Section; name: string }[] = [
  { id: "activity", name: "Мои публикации" },
  { id: "questions", name: "Мои вопросы" },
  { id: "settings", name: "Настройки аккаунта" },
  { id: "notes", name: "Заметки кинолога" },
  { id: "gafus", name: "Мои Гафусы" },
];
function urlTab(): Section {
  if (typeof window === "undefined") return "activity";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return sections.some((section) => section.id === tab) ? (tab as Section) : "activity";
}

/** Same Next avatar target (800px / ~0.6MiB) without adding a shared
 * dependency or changing the original Hono multipart contract. The GIF is
 * intentionally never passed through Canvas: that would destroy animation.
 * Binary encoding of JPEG/PNG/WebP is done entirely before the first POST. */
export async function prepareProfileAvatar(file: File): Promise<File> {
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) ||
    file.size < 1 ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Выберите JPEG, PNG, WebP или GIF размером до 5 МБ.");
  if (file.type === "image/gif") return file;
  if (typeof URL.createObjectURL !== "function" || typeof Image === "undefined")
    throw new Error("Обработка изображения в этом браузере недоступна.");
  const temporaryUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Не удалось прочитать изображение."));
      image.src = temporaryUrl;
    });
    await loaded;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1)
      throw new Error("Размеры изображения некорректны.");
    if (Math.max(width, height) <= 800 && file.size <= 0.6 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось подготовить изображение.");
    const scale = Math.min(1, 800 / Math.max(width, height));
    const targetBytes = Math.floor(0.6 * 1024 * 1024);
    const maxEncodedBytes = 2 * 1024 * 1024;
    let smallest: Blob | null = null;
    // PNG is lossless, so reduce dimensions if needed; JPEG/WebP also vary
    // encoder quality. Preserve original transparency and original MIME type.
    for (const factor of [1, 0.8, 0.65, 0.5, 0.35]) {
      canvas.width = Math.max(1, Math.round(width * scale * factor));
      canvas.height = Math.max(1, Math.round(height * scale * factor));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of file.type === "image/png" ? [undefined] : [0.85, 0.7, 0.55]) {
        const encoded = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) =>
              result ? resolve(result) : reject(new Error("Не удалось сжать изображение.")),
            file.type,
            quality,
          );
        });
        if (encoded.type !== file.type || encoded.size === 0)
          throw new Error("Браузер не поддерживает сохранение этого формата.");
        if (!smallest || encoded.size < smallest.size) smallest = encoded;
        if (encoded.size <= targetBytes)
          return new File([encoded], file.name, {
            type: file.type,
            lastModified: file.lastModified,
          });
      }
    }
    if (smallest && smallest.size <= maxEncodedBytes)
      return new File([smallest], file.name, { type: file.type, lastModified: file.lastModified });
    throw new Error("Не удалось уменьшить изображение до 2 МБ без изменения формата.");
  } finally {
    URL.revokeObjectURL(temporaryUrl);
  }
}

/** Owner picker attached to the existing legacy avatar, not a second profile route.
 * Only original Hono POST /user/avatar. No client-side delete endpoint exists. */
function EditableProfileAvatar({
  profile,
  ownerId,
  isCurrent,
}: {
  profile: Profile;
  ownerId: string;
  isCurrent(): boolean;
}) {
  const cache = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [broken, setBroken] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "unknown">("idle");
  const [message, setMessage] = useState("");
  const active = useRef(true);
  const flight = useRef(false);
  const attempted = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    setBroken(false);
  }, [profile.profile.avatarUrl]);
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);
  const current = () => active.current && isCurrent();
  const avatar = profile.profile.avatarUrl ?? null;
  const display = previewUrl ?? (!broken ? publicImageUrl(avatar) : null);
  const name = profile.profile.fullName || profile.username;
  const pathOf = (raw: string | null | undefined) => {
    if (!raw) return null;
    try {
      return new URL(raw, window.location.origin).pathname;
    } catch {
      return null;
    }
  };
  // A fresh signed URL has a different signature but the SAME persisted key.
  // Compare URL *paths*, never the expiring query string or old ack bytes.
  const match = async (ackPath: string | null, requireNew: boolean) => {
    const owner = await getMyProfile();
    if (!current() || owner.id !== ownerId || owner.username !== profile.username) return null;
    const ownPath = pathOf(owner.profile.avatarUrl);
    if (!ownPath || (ackPath && ownPath !== ackPath) || (requireNew && ownPath === pathOf(avatar)))
      return null;
    const guest = await getPublicProfileSummary(profile.username);
    if (
      !current() ||
      guest.username !== profile.username ||
      pathOf(guest.avatarUrl) !== ownPath ||
      publicImageUrl(owner.profile.avatarUrl ?? null) === null ||
      publicImageUrl(guest.avatarUrl) === null
    )
      return null;
    return owner;
  };
  const commit = (owner: Profile) => {
    if (!current()) return;
    cache.setQueryData(["user", "profile", ownerId], owner);
    setFile(null);
    setState("idle");
    setMessage("");
    setEditing(false);
  };
  const upload = async () => {
    if (!file || !current() || flight.current || attempted.current) return;
    flight.current = true;
    setState("pending");
    setMessage("");
    try {
      // Compression/decoding happens before the irreversible original POST.
      const prepared = await prepareProfileAvatar(file);
      if (!current()) return;
      attempted.current = true; // Network attempted: never blindly replay an unknown ACK.
      const acknowledged = await uploadMyAvatar(prepared);
      if (!current()) return; // A late ACK from the former principal is ignored.
      const owner = await match(pathOf(acknowledged), true);
      if (!current()) return;
      if (owner) commit(owner);
      else {
        setState("unknown");
        setMessage("Аватар не подтверждён чтением профиля. Повторять загрузку нельзя.");
      }
    } catch (error) {
      if (!current()) return;
      const localFailure = !attempted.current;
      const rejected =
        localFailure ||
        (error instanceof ApiError &&
          error.code !== "INVALID_RESPONSE" &&
          [400, 401, 403, 404, 409, 413, 422, 429].includes(error.status));
      // A local Canvas failure never sent bytes; unknown network ACK must not replay.
      if (rejected) attempted.current = false;
      setState(rejected ? "idle" : "unknown");
      setMessage(
        localFailure
          ? "Не удалось подготовить файл. Выберите другое изображение."
          : rejected
            ? "Сервер отклонил файл. Выберите другое изображение."
            : "Результат загрузки неизвестен. Не отправляйте изображение повторно.",
      );
    } finally {
      flight.current = false;
    }
  };
  const check = async () => {
    if (!current() || state !== "unknown" || flight.current) return;
    flight.current = true;
    setState("pending");
    try {
      const owner = await match(null, true);
      if (!current()) return;
      if (owner) commit(owner);
      else {
        setState("unknown");
        setMessage("Новый аватар пока не подтверждён. Повторная отправка запрещена.");
      }
    } catch {
      if (!current()) return;
      setState("unknown");
      setMessage("Не удалось проверить профиль. Загрузка не будет повторена.");
    } finally {
      flight.current = false;
    }
  };
  return (
    <>
      {display ? (
        <img
          className="gafus-profile-avatar-image"
          src={display}
          alt={previewUrl ? "Предпросмотр аватара" : `Аватар ${name}`}
          width={104}
          height={104}
          loading="lazy"
          onError={() => {
            if (!previewUrl) setBroken(true);
          }}
        />
      ) : (
        <img
          className="gafus-profile-avatar-image"
          src="/uploads/avatar.svg"
          alt={`Аватар ${name}`}
          width={104}
          height={104}
          loading="lazy"
        />
      )}
      <button
        type="button"
        className={editor.avatarEditButton}
        aria-label="Изменить аватар"
        disabled={flight.current || state === "pending"}
        onClick={() => {
          if (current() && !flight.current) setEditing((value) => !value);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"
          aria-hidden="true" focusable="false">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
      </button>
      {editing && (
        <div className={editor.avatarEditor} aria-label="Редактирование аватара">
          <label htmlFor="gafus-profile-avatar-file">Фотография профиля</label>
          <input
            id="gafus-profile-avatar-file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={state === "pending" || attempted.current}
            onChange={(event) => {
              if (!current() || state === "pending" || attempted.current) return;
              const selected = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              if (!selected) return;
              if (
                !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(selected.type) ||
                selected.size < 1 ||
                selected.size > 5 * 1024 * 1024
              ) {
                setMessage("Выберите JPEG, PNG, WebP или GIF до 5 МБ.");
                return;
              }
              setFile(selected);
              setMessage("");
            }}
          />
          {file && <p role="status">Предпросмотр: {file.name}</p>}
          {message && <p role={state === "unknown" ? "status" : "alert"}>{message}</p>}
          <div className={editor.avatarActions}>
            {file && !attempted.current && (
              <PrimaryButton type="button" disabled={state === "pending"} onClick={() => void upload()}>
                Сохранить аватар
              </PrimaryButton>
            )}
            {state === "unknown" && (
              <PrimaryButton type="button" disabled={flight.current} onClick={() => void check()}>
                Проверить аватар
              </PrimaryButton>
            )}
            <SecondaryButton variant="red"
              type="button"
              disabled={state === "pending"}
              onClick={() => {
                if (flight.current) return;
                setFile(null);
                setMessage("");
                setEditing(false);
              }}
            >
              Отмена
            </SecondaryButton>
          </div>
        </div>
      )}
    </>
  );
}

/** Original Next Bio + ProfileSections geometry, current Web authenticated GET. */
export function LegacyProfilePresentation({
  profile,
  role,
  ownerId,
  onEdit,
  isCurrent,
}: {
  profile: Profile;
  role?: string;
  ownerId: string;
  onEdit(): void;
  isCurrent(): boolean;
}) {
  const [tab, setTab] = useState<Section>(urlTab);
  // Next remounts /profile on query navigation. Vite keeps this owner view
  // mounted; subscribe to both popstate and our router's NAVIGATE_EVENT so
  // /profile?tab=settings -> /profile never keeps private settings visible.
  const routeSearch = useRouteSearch();
  useEffect(() => {
    setTab(urlTab());
  }, [routeSearch]);
  const choose = (next: Section) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "activity") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  };
  const name = profile.profile.fullName || profile.username;
  // Next Bio trims owner contact and city before presentation.
  const city = profile.profile.city?.trim() || null;
  const ownerEmail = profile.email?.trim() || null;
  // Retained Next Bio: its empty personal-profile notice appears only when
  // ALL profile fields are null (and there are no diplomas), not just when
  // the optional "about" field is missing. The owner DTO has no diplomas.
  const showEmptyNotice = Object.values(profile.profile).every(value => value == null);
  const telegram = profile.profile.telegram?.trim() || null;
  const instagram = profile.profile.instagram?.trim() || null;
  // External contact URLs must be actual HTTPS URLs, not arbitrary user text.
  const website = (() => {
    if (!profile.profile.website) return null;
    try {
      const uri = new URL(profile.profile.website);
      return uri.protocol === "https:" && !uri.username && !uri.password ? uri : null;
    } catch {
      return null;
    }
  })();
  // Match the retained Next Bio owner-only personal facts without projecting
  // unrelated account data or guessing an age when birthDate is unavailable.
  const date = profile.profile.birthDate;
  // Source Next Bio uses the shared Core helpers rather than an independent
  // UTC calendar implementation. Keep source-equivalent behavior across Web
  // and Mobile, including local-date birthdays near midnight.
  const calculatedAge = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(new Date(date).getTime()) ? getAge(date) : null;
  const age = calculatedAge !== null && Number.isFinite(calculatedAge) &&
    calculatedAge >= 0 && calculatedAge <= 125 ? calculatedAge : null;
  const ageLabel = age === null ? "Не указан" :
    `${age} ${declOfNum(age, ["год", "года", "лет"])}`;
  return (
    <div className={`${page.profilePage} next-profile-shell`}>
      <div className={page.profileShell}>
        <div className={bio.wrapper} data-next-profile-identity>
          <div className={bio.profileBanner}>
            <div className={`${bio.avatarContainer} ${editor.editorRoot}`}>
              <EditableProfileAvatar profile={profile} ownerId={ownerId} isCurrent={isCurrent} />
            </div>
            <div className={bio.profileInfo}>
              <h1 className={bio.greeting}>{name}</h1>
              <div className={bio.identityMeta}>
                <span className={bio.username}>@{profile.username}</span>
                <span className={bio.metaSeparator} aria-hidden="true">
                  ·
                </span>
                {ownerEmail ? (
                  <span className={bio.contactInfo}>{ownerEmail}</span>
                ) : (
                  <span className={`${bio.contactInfo} ${bio.contactInfoMissing}`}>
                    Укажите email для восстановления доступа
                  </span>
                )}
              </div>
              <div className={bio.identityActions}>
                {role && role !== "USER" && (
                  <span
                    className={`${bio.roleBadge} ${
                      role === "ADMIN"
                        ? bio.admin
                        : role === "TRAINER"
                          ? bio.trainer
                          : role === "MODERATOR"
                            ? bio.moderator
                            : ""
                    }`}
                  >
                    {role === "ADMIN"
                      ? "Администратор"
                      : role === "TRAINER"
                        ? "Кинолог"
                        : role === "MODERATOR"
                          ? "Модератор"
                          : role === "PARTNER"
                            ? "Партнёр"
                            : ""}
                  </span>
                )}
                <PrimaryButtonLink href="/profile/editBio"
                  className={`${bio.editBioButton} gafus-web1-source-primary`}
                  onClick={(event) => {
                    // Original Next Bio uses an actual link, not a generic
                    // button. Preserve the native Ctrl/Meta/middle-click and
                    // keyboard behavior; plain activation uses existing
                    // Hono-backed SPA edit path without a document reload.
                    if (event.button !== 0 || event.ctrlKey || event.metaKey ||
                        event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    onEdit();
                  }}>
                  Редактировать профиль
                </PrimaryButtonLink>
              </div>
            </div>
            {(instagram || telegram || website) && (
              <nav className={bio.socialLinksContainer} aria-label="Контакты специалиста">
                <span className={bio.contactsHeading}>Контакты</span>
                <div className={bio.socialLinksList}>
                  {instagram && (
                    <a
                      className={bio.socialLink}
                      href={getInstagramUrl(instagram)}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`Instagram: ${instagram}, откроется в новой вкладке`}
                      title={`Instagram: ${instagram}`}
                    >
                      <InstagramIcon className={bio.socialIcon} />
                      <span className={bio.socialText}>
                        <span className={bio.socialLabel}>Instagram</span>
                        <span className={bio.socialUsername}>{instagram}</span>
                      </span>
                      <span className={bio.externalIcon} aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  )}
                  {telegram && (
                    <a
                      className={bio.socialLink}
                      href={getTelegramUrl(telegram)}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`Телеграм: ${telegram}, откроется в новой вкладке`}
                      title={`Телеграм: ${telegram}`}
                    >
                      <TelegramIcon className={bio.socialIcon} />
                      <span className={bio.socialText}>
                        <span className={bio.socialLabel}>Телеграм</span>
                        <span className={bio.socialUsername}>{telegram}</span>
                      </span>
                      <span className={bio.externalIcon} aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  )}
                  {website && (
                    <a
                      className={bio.socialLink}
                      href={website.href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`Открыть сайт ${website.href} в новой вкладке`}
                      title={website.href}
                    >
                      {isYouTubeWebsite(website.href) ?
                        <YouTubeIcon className={bio.socialIcon} /> :
                        <WebsiteIcon className={bio.socialIcon} />}
                      <span className={bio.socialText}>
                        <span className={bio.socialLabel}>Сайт</span>
                        <span className={bio.socialUsername}>
                          {website.hostname.replace(/^www\./, "")}
                        </span>
                      </span>
                      <span className={bio.externalIcon} aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  )}
                </div>
              </nav>
            )}
          </div>
          <div className={bio.detailsGrid}>
            <div className={bio.descriptionColumn}>
              <div className={bio.personalFacts} aria-label="Личные сведения">
                <div className={bio.personalFact}>
                  <span className={bio.factLabel}>Возраст</span>
                  <span className={bio.factValue}>{ageLabel}</span>
                </div>
                <div className={bio.personalFact}>
                  <span className={bio.factLabel}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>{" "}
                    Город
                  </span>
                  <span className={city ? bio.factValue : bio.factMissing}>
                    {city || "Не указан"}
                  </span>
                </div>
              </div>
              {profile.profile.about ? (
                <section className={bio.aboutBlock} aria-label="О себе">
                  <h2 className={bio.aboutTitle}>
                    <NextProfileIcon name="about" /> О себе
                  </h2>
                  <p className={bio.aboutText}>{profile.profile.about}</p>
                </section>
              ) : showEmptyNotice ? (
                <p className={bio.emptyNotice}>Информация о себе не внесена</p>
              ) : null}
            </div>
          </div>
        </div>
        <nav
          className={page.sectionNavigation}
          aria-label="Разделы профиля"
          data-next-profile-sections
        >
          <div className={page.contentNavigation}>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`${page.navigationItem} ${tab === section.id ? page.navigationActive : ""}`}
                aria-pressed={tab === section.id}
                onClick={() => choose(section.id)}
              >
                {section.name}
              </button>
            ))}
          </div>
        </nav>
        <div id={`profile-${tab}`} className={page.viewContent}>
          {tab === "activity" && (
            <div className={page.activityColumns}>
              <section className="gafus-profile-activity" aria-label="Мои публикации">
                <Suspense fallback={<Loading message="Загружаем публикации…" />}>
                  <EmbeddedProfileActivity
                    key={profile.username}
                    userId={ownerId}
                    username={profile.username}
                    isCurrent={isCurrent}
                  />
                </Suspense>
              </section>
            </div>
          )}
          {tab === "questions" && (
            <div className={page.activityColumns}>
              <Suspense fallback={<Loading message="Загружаем вопросы…" />}>
                <MyQuestionsPanel ownerId={ownerId} />
              </Suspense>
            </div>
          )}
          {tab === "notes" && (
            <div className={page.notesCard}>
              <StudentNotesPanel ownerId={ownerId} isCurrent={isCurrent} />
            </div>
          )}
          {tab === "gafus" && (
            <Suspense fallback={<Loading message="Загружаем Гафусы…" />}>
              <WalletConnectedPanel ownerId={ownerId} isCurrent={isCurrent} />
            </Suspense>
          )}
          {tab === "settings" && (
            <div className={page.settingsLayout}>
              <div className={page.settingsMain}>
                <LegacyProfileSettings profile={profile} />
              </div>
              <aside className={page.settingsAside} aria-label="Подписка Gafus Premium">
                <LegacyPremiumConnectedCard ownerId={ownerId} isCurrent={isCurrent} />
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
