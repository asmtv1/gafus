import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton } from "../../shared/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type KeyboardEvent } from "react";
import { ApiError } from "../../shared/api/client";
import { useRouteSearch, navigate, type RoutePath } from "../../shared/router/location";
import { useCurrentUser } from "../../shared/auth/useAuth";
import profilePage from "../../brand/LegacyProfilePage.module.css";
import primary from "../../brand/LegacyPrimaryButton.module.css";
import visitor from "./WEB1VisitorToggle.module.css";
import activityLayout from "./WEB1PublicActivityLayout.module.css";
import hero from "./WEB1PublicHero.module.css";
import bio from "../../brand/LegacyProfileBio.module.css";
import petStyles from "./WEB1PublicPets.module.css";
import { formatPetAge, getPetTypeLabel } from "@gafus/core-client/utils/pet";
import { getAge } from "@gafus/core-client/utils/age/getAge";
import { declOfNum } from "@gafus/core-client/utils/pluralize";
import { NextProfileIcon } from "./NextProfileIcon";
import {
  InstagramIcon,
  TelegramIcon,
  WebsiteIcon,
  YouTubeIcon,
  isYouTubeWebsite,
} from "./NextSocialIcons";
import { NextExternalLinkIcon } from "./NextExternalLinkIcon";
import { PublicAuthorActivityRead } from "./PublicAuthorActivityRead";
import { PublicTrainerCourses } from "./PublicTrainerCourses";
import { getPublicProfileSummary, publicExternalUrl, publicImageUrl } from "./publicProfileApi";

const roleLabels: Record<string, string> = {
  ADMIN: "Администратор",
  MODERATOR: "Модератор",
  TRAINER: "Кинолог",
  PARTNER: "Партнёр",
};
const safeHandle = (value: string | null) =>
  value &&
  value.length <= 100 &&
  ![...value].some(
    (c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127 || c === "/" || c === "\\",
  )
    ? value
    : null;

/** Existing legacy /profile?username= visitor sections, strictly from AG1 public DTO. */
export function PublicProfileView({ username, hasOwner }: { username: string; hasOwner: boolean }) {
  const search = useRouteSearch();
  const me = useCurrentUser(hasOwner);
  // The visitor tab itself replaces the old duplicate reveal button. Keep
  // activity GETs opt-in: only a real tab activation requests author lists.
  const [activityActivated, setActivityActivated] = useState(false);
  const [view, setView] = useState<"activity" | "questions">(() =>
    new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("tab") ===
    "questions"
      ? "questions"
      : "activity",
  );
  useEffect(() => {
    setView(new URLSearchParams(search).get("tab") === "questions" ? "questions" : "activity");
  }, [search, username]);
  const selectView = (next: "activity" | "questions") => {
    setActivityActivated(true);
    setView(next);
    const url = new URL(window.location.href);
    if (next === "activity") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  };
  const onVisitorKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "activity"
        : event.key === "End"
          ? "questions"
          : view === "activity"
            ? "questions"
            : "activity";
    selectView(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-profile-view="${next}"]`)
      ?.focus();
  };
  const query = useQuery({
    queryKey: ["user", "public-profile", username],
    queryFn: () => getPublicProfileSummary(username),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const ready = query.isSuccess && !query.isFetching;
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  const profile = ready ? query.data : null;
  const photo = publicImageUrl(profile?.avatarUrl ?? null);
  const telegram = safeHandle(profile?.telegram ?? null);
  const instagram = safeHandle(profile?.instagram ?? null);
  const website = publicExternalUrl(profile?.website ?? null);
  const birthDate = profile?.birthDate ?? null;
  const calculatedAge =
    birthDate && Number.isFinite(Date.parse(birthDate)) ? getAge(birthDate) : null;
  const age =
    calculatedAge !== null &&
    Number.isFinite(calculatedAge) &&
    calculatedAge >= 0 &&
    calculatedAge <= 125
      ? calculatedAge
      : null;
  const roleClass =
    profile?.role === "ADMIN"
      ? bio.admin
      : profile?.role === "MODERATOR"
        ? bio.moderator
        : profile?.role === "TRAINER"
          ? bio.trainer
          : "";
  // Original ProfileClient mounts the Bio and sections inside profilePage /
  // profileShell, not the pre-migration .profile-overview card. The latter
  // doubles borders and its descendant ul/heading rules override retained
  // Next Course/Pet sections. Preserve a return link only on error/loading.
  return (
    <section className={profilePage.profilePage} aria-label="Публичный профиль">
      {!profile && (
        <p>
          <BackButtonLink to={hasOwner ? "/profile" : "/"}>
            {hasOwner ? "Мой профиль" : "На главную"}
          </BackButtonLink>
        </p>
      )}
      {!profile && <h2>Профиль @{username}</h2>}
      {query.isPending && <Loading message="Загружаем публичный профиль…" />}
      {query.isFetching && query.data && <p role="status">Обновляем публичный профиль…</p>}
      {query.isError && (
        <div role="alert">
          <p>
            {notFound
              ? "Публичный профиль не найден."
              : forbidden
                ? "Публичный профиль недоступен."
                : "Не удалось загрузить публичный профиль."}
          </p>
          {!notFound && !forbidden && (
            <PrimaryButton type="button" onClick={() => void query.refetch()}>
              Повторить
            </PrimaryButton>
          )}
        </div>
      )}
      {profile && (
        <div className={profilePage.profileShell}>
          <div className={bio.wrapper} data-next-profile-identity>
            <div className={`${bio.profileBanner} ${hero.banner}`}>
              <div className={`${bio.avatarContainer} ${hero.avatarFrame}`}>
                <img
                  src={photo ?? "/uploads/avatar.svg"}
                  alt={photo ? `Аватар пользователя @${profile.username}` : "Аватар по умолчанию"}
                  loading="lazy"
                  width={180}
                  height={180}
                  className={`public-profile-avatar ${hero.avatarImage}`}
                />
              </div>
              <div className={bio.profileInfo}>
                <h1 className={`${bio.greeting} ${hero.name}`}>
                  {profile.fullName || profile.username}
                </h1>
                <div className={bio.identityMeta}>
                  <span className={bio.username}>@{profile.username}</span>
                  <span className={bio.metaSeparator} aria-hidden="true">
                    ·
                  </span>
                  <span className={bio.contactInfo}>
                    {telegram ? `@${telegram}` : "Контакты не указаны"}
                  </span>
                </div>
                {roleLabels[profile.role] && (
                  <div className={bio.identityActions}>
                    <span className={`${bio.roleBadge} ${roleClass}`}>
                      {roleLabels[profile.role]}
                    </span>
                  </div>
                )}
                {hasOwner &&
                  me.data?.username &&
                  me.data.username !== profile.username &&
                  profile.username.toLowerCase() !== "lana" &&
                  /^[A-Za-z0-9_-]{2,128}$/.test(profile.username) && (
                    <div className={bio.identityActions}>
                      <PrimaryButton
                        type="button"
                        onClick={() => navigate(`/chats?to=${profile.username}` as RoutePath)}
                      >
                        Написать сообщение
                      </PrimaryButton>
                    </div>
                  )}
              </div>
              {(telegram || instagram || website) && (
                <nav aria-label="Контакты специалиста" className={bio.socialLinksContainer}>
                  <span className={bio.contactsHeading}>Контакты</span>
                  <div className={bio.socialLinksList}>
                    {instagram && (
                      <a
                        href={`https://www.instagram.com/${encodeURIComponent(instagram)}/`}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className={bio.socialLink}
                        aria-label={`Instagram: ${instagram}, откроется в новой вкладке`}
                      >
                        <InstagramIcon className={bio.socialIcon} />
                        <span className={bio.socialText}>
                          <span className={bio.socialLabel}>Instagram</span>
                          <span className={bio.socialUsername}>{instagram}</span>
                        </span>
                        <NextExternalLinkIcon className={bio.externalIcon} />
                      </a>
                    )}
                    {telegram && (
                      <a
                        href={`https://t.me/${encodeURIComponent(telegram)}`}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className={bio.socialLink}
                        aria-label={`Телеграм: ${telegram}, откроется в новой вкладке`}
                      >
                        <TelegramIcon className={bio.socialIcon} />
                        <span className={bio.socialText}>
                          <span className={bio.socialLabel}>Телеграм</span>
                          <span className={bio.socialUsername}>{telegram}</span>
                        </span>
                        <NextExternalLinkIcon className={bio.externalIcon} />
                      </a>
                    )}
                    {website && (
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className={bio.socialLink}
                        aria-label={`Открыть сайт ${website} в новой вкладке`}
                      >
                        {isYouTubeWebsite(website) ? (
                          <YouTubeIcon className={bio.socialIcon} />
                        ) : (
                          <WebsiteIcon className={bio.socialIcon} />
                        )}
                        <span className={bio.socialText}>
                          <span className={bio.socialLabel}>Сайт</span>
                          <span className={bio.socialUsername}>
                            {new URL(website).hostname.replace(/^www\./, "")}
                          </span>
                        </span>
                        <NextExternalLinkIcon className={bio.externalIcon} />
                      </a>
                    )}
                  </div>
                </nav>
              )}
            </div>
            <div className={bio.detailsGrid}>
              <div className={bio.descriptionColumn}>
                {(age !== null || profile.city) && (
                  <div className={bio.personalFacts} aria-label="Личные сведения">
                    {age !== null && (
                      <div className={bio.personalFact}>
                        <span className={bio.factLabel}>Возраст</span>
                        <span className={bio.factValue}>
                          {age} {declOfNum(age, ["год", "года", "лет"])}
                        </span>
                      </div>
                    )}
                    {profile.city && (
                      <div className={bio.personalFact}>
                        <span className={bio.factLabel}>
                          <svg
                            viewBox="0 0 24 24"
                            width={14}
                            height={14}
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
                          </svg>
                          Город
                        </span>
                        <span className={bio.factValue}>{profile.city}</span>
                      </div>
                    )}
                  </div>
                )}
                {profile.about && (
                  <div className={bio.aboutBlock}>
                    <h2 className={bio.aboutTitle}>
                      <NextProfileIcon name="about" /> О себе
                    </h2>
                    <p className={bio.aboutText}>{profile.about}</p>
                  </div>
                )}
                {!profile.about && !profile.city && age === null && (
                  <p className={bio.emptyNotice}>Информация о себе не внесена</p>
                )}
              </div>
            </div>
            {profile.role === "TRAINER" && profile.courses && (
              <PublicTrainerCourses courses={profile.courses} />
            )}
            {profile.diplomas.length > 0 && (
              <section aria-label="Дипломы пользователя" className={bio.diplomasSection}>
                <h2>Дипломы</h2>
                <ul>
                  {profile.diplomas.map((d) => (
                    <li key={d.id}>
                      {publicExternalUrl(d.url) ? (
                        <a
                          href={publicExternalUrl(d.url)!}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                        >
                          {d.title}
                        </a>
                      ) : (
                        d.title
                      )}
                      {d.issuedBy && ` — ${d.issuedBy}`}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          {profile.pets.length > 0 && (
            <div className={profilePage.publicPets}>
              <section aria-label="Питомцы" className={petStyles.section}>
                <h2 className={petStyles.heading}>Питомцы</h2>
                <ul className={petStyles.list}>
                  {profile.pets.map((pet) => {
                    const age = formatPetAge(pet.birthDate);
                    return (
                      <li key={pet.id} className={petStyles.card}>
                        <img
                          src={
                            publicImageUrl(pet.photoUrl) ??
                            (pet.type === "CAT"
                              ? "/images/pet-avatar-cat.png"
                              : "/images/pet-avatar-dog.png")
                          }
                          alt={`Питомец ${pet.name}`}
                          loading="lazy"
                          width={80}
                          height={80}
                          className={petStyles.photo}
                        />
                        <div className={petStyles.info}>
                          <p className={petStyles.species}>{getPetTypeLabel(pet.type)}</p>
                          <h3 className={petStyles.name}>{pet.name}</h3>
                          <p className={petStyles.detail}>{pet.breed || "Порода не указана"}</p>
                          {age && <p className={petStyles.detail}>{age}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}
          <div
            role="radiogroup"
            aria-label={`Разделы профиля @${profile.username}`}
            className={profilePage.visitorNavigation}
          >
            {(["activity", "questions"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                data-profile-view={option}
                aria-checked={view === option}
                tabIndex={view === option ? 0 : -1}
                className={`${view === option ? primary.root : "button-secondary"} ${profilePage.visitorToggle} ${visitor.radio}`}
                onClick={() => selectView(option)}
                onKeyDown={onVisitorKeyDown}
              >
                {option === "activity" ? "Публикации" : "Вопросы"} @{profile.username}
              </button>
            ))}
          </div>
          {activityActivated && (
            <div
              id={view === "activity" ? "profile-activity" : "profile-questions"}
              className={activityLayout.activityResult}
            >
              <PublicAuthorActivityRead username={profile.username} section={view} startOpened />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
