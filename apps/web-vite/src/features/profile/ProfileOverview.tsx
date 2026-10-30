import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton, SecondaryButton } from "../../shared/ui";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMyProfile,
  updateMyProfile,
  changedProfileFields,
  readbackMatchesProfile,
  type ProfileChanges,
  type ProfileOverview as Profile,
} from "./profileApi";
import { navigate, RouteLink } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import { GalleryOptInHarness } from "../gallery/GalleryOptInHarness";
import { PublicGalleryView } from "../gallery/PublicGalleryView";
import type { AlbumSummary, AlbumPhoto, GalleryPage } from "../gallery/galleryApi";
import { ConsultationOptInHarness } from "../consultations/ConsultationOptInHarness";
import type { ConsultationsReadLoaders } from "../consultations/ConsultationReadOnlyPanel";
import type { BookingSourceMockTransport } from "../consultations/bookingSourceMock";
import { SubscriptionOptInHarness } from "../commerce/SubscriptionOptInHarness";
import type { SubscriptionReadLoader } from "../commerce/subscriptionReadMock";
import { RemindersOptIn } from "./RemindersOptIn";
import type { SyntheticReminderTransport } from "./remindersSourceMock";
import { ProfilePetEditOptIn } from "./ProfilePetEditOptIn";
import { AchievementsOptIn } from "../achievements/AchievementsOptIn";
import type { ServerAchievementsEntitlementWire } from "../achievements/achievementsEntitlement";
import { GuidesOptIn } from "../gafus/GuidesOptIn";
import { WalletOptIn } from "../gafus/WalletOptIn";
import { PartnerOptIn } from "../partner/PartnerOptIn";
import { AccountDeleteOptIn } from "./AccountDeleteOptIn";
import { LegacyProfilePresentation } from "./LegacyProfilePresentation";
import editStyles from "../../brand/LegacyEditBioForm.module.css";
import "./web1-local-parity.css";
import type { SyntheticAccountDeletion } from "./accountDeleteReview";
import type { PartnerSourceWire } from "../partner/partnerReadApi";
import type { WalletSourceMock } from "../gafus/walletReadApi";
import type { GuidesSourceMock } from "../gafus/guidesReadApi";
import type { SyntheticAchievementTransport } from "../achievements/achievementsApi";
import type { PetEditWire } from "../pets/petEditSourceMock";

function ProfileEditor({
  userId,
  data,
  onClose,
  isCurrent,
  standalone = false,
}: {
  userId: string;
  data: Profile;
  onClose(): void;
  isCurrent(): boolean;
  standalone?: boolean;
}) {
  const cache = useQueryClient();
  const [fullName, setFullName] = useState(data.profile.fullName ?? "");
  const [city, setCity] = useState(data.profile.city ?? "");
  const [about, setAbout] = useState(data.profile.about ?? "");
  const [telegram, setTelegram] = useState(data.profile.telegram ?? "");
  const [instagram, setInstagram] = useState(data.profile.instagram ?? "");
  const [website, setWebsite] = useState(data.profile.website ?? "");
  const [birthDate, setBirthDate] = useState(data.profile.birthDate ?? "");
  const [outcome, setOutcome] = useState<"idle" | "pending" | "rejected" | "unknown" | "readback">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const attempted = useRef(false);
  const readRequested = useRef(false);
  const alive = useRef(true);
  const attemptedChanges = useRef<ProfileChanges>({});
  useEffect(() => {
    // React StrictMode replays effect cleanup/setup on the same mounted form.
    // Re-enable only on setup; a true unmount still revokes this instance.
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const safe = () => alive.current && isCurrent();

  async function verify(changes: ProfileChanges, manual = false) {
    try {
      const current = await getMyProfile();
      if (!safe()) return;
      if (!readbackMatchesProfile(current, userId, changes)) {
        setOutcome("unknown");
        setMessage(
          "Данные после чтения не подтверждают изменения. Повторять запись автоматически нельзя.",
        );
        return;
      }
      cache.setQueryData(["user", "profile", userId], current);
      if (manual) {
        setOutcome("readback");
        setMessage("Текущие данные совпадают. Это не доказывает результат предыдущего запроса.");
      } else onClose();
    } catch {
      if (!safe()) return;
      setOutcome("unknown");
      setMessage("Не удалось проверить изменения на сервере. Не отправляйте запись повторно.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (attempted.current || !safe()) return;
    let changes: ProfileChanges;
    try {
      changes = changedProfileFields(data.profile, {
        fullName, city, about, telegram, instagram, website, birthDate,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Проверьте контактные данные.");
      return;
    }
    if (Object.keys(changes).length === 0) {
      setMessage("Нет изменений для сохранения.");
      return;
    }
    if (fullName.trim().length > 120 || city.trim().length > 100 || about.trim().length > 2000) {
      setMessage("Превышена допустимая длина поля.");
      return;
    }
    attempted.current = true;
    attemptedChanges.current = changes;
    setMessage("");
    setOutcome("pending");
    try {
      await updateMyProfile(changes);
    } catch (error) {
      if (!safe()) return;
      const rejected =
        error instanceof ApiError &&
        error.code !== "INVALID_RESPONSE" &&
        error.code !== "STATUS_MISMATCH" &&
        [400, 401, 403, 404, 409, 422, 429].includes(error.status);
      setOutcome(rejected ? "rejected" : "unknown");
      setMessage(
        rejected
          ? "Сервер отклонил изменение профиля. Выйдите и откройте форму заново."
          : "Результат сохранения неизвестен. Не повторяйте отправку без проверки.",
      );
      return;
    }
    if (safe()) await verify(changes);
  }

  async function manualReadback() {
    if (readRequested.current || !safe()) return;
    readRequested.current = true;
    setOutcome("pending");
    await verify(attemptedChanges.current, true);
  }

  return (
    <form onSubmit={(event) => void submit(event)} aria-label="Редактирование профиля"
      className={standalone ? editStyles.form : undefined}>
      <div className={standalone ? editStyles.profile_info_section : undefined}>
        {standalone && <h3>Основная информация</h3>}
      <label htmlFor="profile-edit-name">Имя</label>
      <input
        id="profile-edit-name"
        value={fullName}
        maxLength={120}
        disabled={attempted.current}
        onChange={(event) => setFullName(event.target.value)}
      />
      <label htmlFor="profile-edit-city">Город</label>
      <input
        id="profile-edit-city"
        value={city}
        maxLength={100}
        disabled={attempted.current}
        onChange={(event) => setCity(event.target.value)}
      />
      <label htmlFor="profile-edit-about">О себе</label>
      <textarea
        id="profile-edit-about"
        value={about}
        maxLength={2000}
        rows={4}
        disabled={attempted.current}
        onChange={(event) => setAbout(event.target.value)}
      />
      <label htmlFor="profile-edit-birthDate">Дата рождения</label>
      <input type="date" id="profile-edit-birthDate" value={birthDate}
        disabled={attempted.current} onChange={event => setBirthDate(event.target.value)} />
      </div>
      <div className={standalone ? editStyles.profile_info_section : undefined}>
        {standalone && <h3>Контактная информация</h3>}
      <fieldset className="profile-edit-contacts">
        {!standalone && <legend>Контактная информация</legend>}
        <label htmlFor="profile-edit-telegram">Телеграм для связи</label>
        <input id="profile-edit-telegram" maxLength={100}
          value={telegram} disabled={attempted.current}
          onChange={event => setTelegram(event.target.value)}
          placeholder="username или @username"/>
        <label htmlFor="profile-edit-instagram">Инста</label>
        <input id="profile-edit-instagram" maxLength={100}
          value={instagram} disabled={attempted.current}
          onChange={event => setInstagram(event.target.value)}
          placeholder="username"/>
        <label htmlFor="profile-edit-website">Сайт или YouTube</label>
        <input id="profile-edit-website" maxLength={200}
          value={website} disabled={attempted.current}
          onChange={event => setWebsite(event.target.value)}
          placeholder="example.com"/>
      </fieldset>
      </div>
      {message && <p role={outcome === "readback" ? "status" : "alert"}>{message}</p>}
      <div className={standalone ? editStyles.form_buttons : "profile-edit-actions"}>
        {!attempted.current && (
          <button type="submit" disabled={outcome === "pending"}
            className={standalone ? editStyles.form_button : undefined}>
            {outcome === "pending" ? "Сохраняем…" : "Сохранить"}
          </button>
        )}
        {outcome === "unknown" && !readRequested.current && (
          <PrimaryButton type="button" onClick={() => void manualReadback()}>
            Проверить профиль
          </PrimaryButton>
        )}
        <SecondaryButton variant={attempted.current ? "default" : "red"}
          type="button"
          className={standalone ? `${editStyles.form_button} ${editStyles.form_button_cancel}` :
            "button-secondary"}
          disabled={outcome === "pending"}
          onClick={onClose}
        >
          {attempted.current ? "Вернуться к профилю" : "Отмена"}
        </SecondaryButton>
      </div>
    </form>
  );
}

export function ProfileOverview({
  userId,
  editMode = false,
  showGalleryOptIn = false,
  galleryAlbumLoader,
  galleryDetailLoader,
  galleryPhotoLoader,
  galleryNavOnly = false,
  galleryRouteMode = false,
  galleryRouteAlbumId = null,
  trainingNavOnly = false,
  galleryRequestedUsername = null,
  showConsultationsOptIn = false,
  consultationsLoaders,
  consultationsNow,
  consultationsNavOnly = false,
  consultationsBookingMockTransport,
  showSubscriptionOptIn = false,
  subscriptionReadLoader,
  showRemindersOptIn = false,
  remindersSyntheticTransport,
  showPetEditOptIn = false,
  petEditSyntheticTransport,
  showAchievementsOptIn = false,
  achievementsSyntheticTransport,
  achievementsEntitlement,
  showGuidesOptIn = false,
  guidesSyntheticTransport,
  showWalletOptIn = false,
  walletSyntheticTransport,
  showPartnerOptIn = false,
  partnerSyntheticTransport,
  showDeleteAccountOptIn = false,
  deleteAccountSyntheticTransport,
}: {
  userId: string;
  editMode?: boolean;
  showGalleryOptIn?: boolean;
  galleryAlbumLoader?: (
    id: string,
    username: string,
    cursor: string | null,
  ) => Promise<GalleryPage<AlbumSummary>>;
  galleryDetailLoader?: (id: string, ownerId: string, username: string) => Promise<AlbumSummary>;
  galleryPhotoLoader?: (id: string, cursor: string | null) => Promise<GalleryPage<AlbumPhoto>>;
  trainingNavOnly?: boolean;
  galleryNavOnly?: boolean;
  galleryRouteMode?: boolean;
  galleryRouteAlbumId?: string | null;
  galleryRequestedUsername?: string | null;
  showConsultationsOptIn?: boolean;
  consultationsNavOnly?: boolean;
  consultationsLoaders?: ConsultationsReadLoaders;
  consultationsNow?: Date;
  consultationsBookingMockTransport?: BookingSourceMockTransport;
  showSubscriptionOptIn?: boolean;
  subscriptionReadLoader?: SubscriptionReadLoader;
  showRemindersOptIn?: boolean;
  remindersSyntheticTransport?: SyntheticReminderTransport;
  showPetEditOptIn?: boolean;
  petEditSyntheticTransport?: PetEditWire;
  showAchievementsOptIn?: boolean;
  achievementsSyntheticTransport?: SyntheticAchievementTransport;
  achievementsEntitlement?: ServerAchievementsEntitlementWire;
  showGuidesOptIn?: boolean;
  guidesSyntheticTransport?: GuidesSourceMock;
  showWalletOptIn?: boolean;
  walletSyntheticTransport?: WalletSourceMock;
  showPartnerOptIn?: boolean;
  partnerSyntheticTransport?: PartnerSourceWire;
  showDeleteAccountOptIn?: boolean;
  deleteAccountSyntheticTransport?: SyntheticAccountDeletion;
}) {
  const [editing, setEditing] = useState(editMode);
  const authClient = useQueryClient();
  const authInitial = useRef(
    authClient.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null,
  );
  const ownerEpoch = useRef(0);
  const seenPrincipal = useRef(authInitial.current);
  const authRevision = useSyncExternalStore(
    (callback) =>
      authClient.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey.length === CURRENT_USER_QUERY_KEY.length &&
          event.query.queryKey.every((v: unknown, i: number) => v === CURRENT_USER_QUERY_KEY[i])
        ) {
          const next = authClient.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null;
          if (
            next !== seenPrincipal.current &&
            (next !== null || event.type === "removed" || event.query.state.data === null)
          ) {
            seenPrincipal.current = next;
            ownerEpoch.current++;
            callback();
          }
        }
      }),
    () => ownerEpoch.current,
    () => ownerEpoch.current,
  );
  const authCurrent = authClient.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
  const privateSessionOk =
    authInitial.current === userId && authCurrent?.id === userId && authRevision === 0;
  const sessionIsCurrent = () =>
    authInitial.current === userId &&
    authClient.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId &&
    ownerEpoch.current === 0;
  const result = useQuery({
    queryKey: ["user", "profile", userId],
    queryFn: getMyProfile,
    enabled: privateSessionOk,
    staleTime: 0,
    retry: false,
  });

  // A cached owner result does not prove current access while GET refreshes.
  // Hide private fields, edit mutation controls and dependent opt-ins until
  // the newest server result succeeds for the confirmed principal.
  const profileReady = result.isSuccess && !result.isFetching;
  const isOwner = privateSessionOk && profileReady && result.data.id === userId;
  const sessionExpired = result.error instanceof ApiError && result.error.status === 401;

  if (
    galleryRouteMode &&
    galleryRequestedUsername !== null &&
    !/^[A-Za-z0-9_-]{1,128}$/.test(galleryRequestedUsername)
  )
    return (
      <section role="alert" aria-label="Фотоальбомы">
        <p>Некорректный адрес фотоальбомов.</p>
        <RouteLink to="/profile">Мой профиль</RouteLink>
      </section>
    );

  if (!privateSessionOk)
    return (
      <section className="profile-overview" role="alert">
        <p>Сессия изменилась. Вернитесь к профилю и откройте его заново.</p>
        <RouteLink to="/profile">Мой профиль</RouteLink>
      </section>
    );

  if (galleryRouteMode) {
    return (
      <section className="profile-overview" aria-label="Фотоальбомы">
        {result.isPending && <Loading message="Проверяем владельца фотоальбомов…" />}
        {result.isFetching && result.data && (
          <Loading variant="compact" message="Перепроверяем владельца фотоальбомов…" />
        )}
        {result.isError && (
          <div role="alert">
            <p>Не удалось подтвердить владельца альбомов.</p>
            <PrimaryButton type="button" onClick={() => void result.refetch()}>
              Повторить
            </PrimaryButton>
          </div>
        )}
        {profileReady && !isOwner && <p role="alert">Альбомы этого пользователя недоступны.</p>}
        {isOwner && (galleryRequestedUsername !== null &&
          galleryRequestedUsername !== result.data.username ?
            <PublicGalleryView key={userId+":"+galleryRequestedUsername}
              viewerId={userId} ownerUsername={galleryRequestedUsername}
              routeAlbumId={galleryRouteAlbumId} isCurrent={sessionIsCurrent}/> :
            <GalleryOptInHarness
              enabled
              userId={userId}
              username={result.data.username}
              listAlbums={galleryAlbumLoader}
              getAlbum={galleryDetailLoader}
              getPhotos={galleryPhotoLoader}
              routeMode
              routeAlbumId={galleryRouteAlbumId}
            />
        )}
      </section>
    );
  }
  if (editMode && isOwner) {
    return <main className={editStyles.container} aria-label="Редактирование профиля">
      <h1 className={editStyles.title}>Редактировать «О себе»</h1>
      <div className={editStyles.form_container}>
        <ProfileEditor key={result.data.id} userId={userId} data={result.data}
          isCurrent={sessionIsCurrent} standalone onClose={() => navigate("/profile")}/>
      </div>
    </main>;
  }
  return (
    <section
      className="profile-overview"
      aria-label={editMode ? "Редактирование профиля" : "Мой профиль"}
    >
      {editMode && <h2>Редактировать «О себе»</h2>}
      {editMode && (
        <p>
          <BackButtonLink to="/profile">Мой профиль</BackButtonLink>
        </p>
      )}
      {editMode && (
        <p className="note">
          Редактируйте данные и контакты своего профиля. Изменения сохраняются на сервере.
        </p>
      )}
      {result.isPending && <Loading message="Загружаем профиль…" />}
      {result.isFetching && result.data && <Loading variant="compact" message="Перепроверяем профиль…" />}
      {result.isError && (
        <div role="alert">
          <p>
            {sessionExpired ? "Сессия завершена. Войдите снова." : "Не удалось загрузить профиль."}
          </p>
          {sessionExpired ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            <PrimaryButton type="button" onClick={() => void result.refetch()}>
              Повторить
            </PrimaryButton>
          )}
        </div>
      )}
      {profileReady && !isOwner && (
        <p role="alert">Ошибка данных профиля: пользователь не совпадает.</p>
      )}
      {isOwner &&
        (editing ? (
          <ProfileEditor
            userId={userId}
            data={result.data}
            isCurrent={sessionIsCurrent}
            onClose={() => {
              setEditing(false);
              if (editMode) navigate("/profile");
            }}
          />
        ) : (
          <LegacyProfilePresentation profile={result.data} ownerId={userId}
            role={authCurrent?.role} isCurrent={sessionIsCurrent}
            onEdit={() => {
              // Retained Next Bio uses a real /profile/editBio route. Preserve
              // direct-mounted editor behavior for isolated owner form tests;
              // the actual AppRouter remounts its source standalone page on
              // this same-origin SPA navigation without a document reload.
              setEditing(true);
              if (window.location.pathname === "/profile") navigate("/profile/editBio");
            }} />
        ))}

      {/* LegacyProfilePresentation owns the notes tab; rendering a second
          StudentNotesPanel here would fetch private notes on every profile tab. */}
      <AchievementsOptIn
        enabled={showAchievementsOptIn && isOwner && !editMode}
        ownerId={userId}
        transport={achievementsSyntheticTransport}
        entitlement={achievementsEntitlement}
      />
      <GuidesOptIn
        enabled={showGuidesOptIn && isOwner && !editMode}
        ownerId={userId}
        transport={guidesSyntheticTransport}
      />
      <WalletOptIn
        enabled={showWalletOptIn && isOwner && !editMode}
        ownerId={userId}
        transport={walletSyntheticTransport}
      />
      <PartnerOptIn
        enabled={showPartnerOptIn && isOwner && !editMode}
        ownerId={userId}
        transport={partnerSyntheticTransport}
      />
      <AccountDeleteOptIn
        enabled={showDeleteAccountOptIn && isOwner && !editMode && authCurrent?.role === "USER"}
        ownerId={userId}
        username={isOwner ? result.data.username : ""}
        wire={deleteAccountSyntheticTransport}
        isCurrent={() =>
          sessionIsCurrent() &&
          authClient.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.role === "USER"
        }
      />
      <ProfilePetEditOptIn
        enabled={showPetEditOptIn && isOwner && !editMode}
        ownerId={userId}
        transport={petEditSyntheticTransport}
      />
      <RemindersOptIn
        enabled={showRemindersOptIn && isOwner && !editMode}
        userId={userId}
        transport={remindersSyntheticTransport}
      />
      <SubscriptionOptInHarness
        enabled={showSubscriptionOptIn && isOwner && !editMode}
        userId={userId}
        loadSnapshot={subscriptionReadLoader}
      />
      {consultationsNavOnly && showConsultationsOptIn && isOwner && !editMode && (
        <p>
          <RouteLink to="/consultations">Консультации с кинологом (макет)</RouteLink>
        </p>
      )}
      <ConsultationOptInHarness
        enabled={showConsultationsOptIn && isOwner && !editMode && !consultationsNavOnly}
        userId={userId}
        username={isOwner ? result.data.username : null}
        loaders={consultationsLoaders}
        now={consultationsNow}
        bookingMockTransport={consultationsBookingMockTransport}
      />
      {trainingNavOnly && isOwner && !editMode && (
        <p>
          <RouteLink to="/courses">Тренировки и курс дня (макет)</RouteLink>
        </p>
      )}
      <GalleryOptInHarness
        enabled={showGalleryOptIn && isOwner && !editMode && !galleryNavOnly}
        userId={userId}
        username={isOwner ? result.data.username : null}
        listAlbums={galleryAlbumLoader}
        getAlbum={galleryDetailLoader}
        getPhotos={galleryPhotoLoader}
      />

    </section>
  );
}
