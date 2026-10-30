import { Loading } from "./shared/ui";

import type {SyntheticAchievementTransport} from "./features/achievements/achievementsApi";
import type {ServerAchievementsEntitlementWire} from "./features/achievements/achievementsEntitlement";
import type {ExcuseFixture} from "./features/excuses/excuseSourceMock";
import { Component,Fragment,lazy,Suspense,useEffect,useLayoutEffect,useRef,useState,
  useSyncExternalStore,type ReactNode } from "react";
import {useIsMutating,useMutationState,useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY,EXPLICIT_LOGIN_QUERY_KEY,
  type ExplicitLoginReceipt} from "./shared/auth/useAuth";
import type {AuthUser} from "./shared/auth/authApi";
import { CourseViewSessionContext } from "./features/courses/courseCatalogFilters";
import {listCourses} from "./features/courses/courseApi";
import {ApiError} from "./shared/api/client";
import {useQuery} from "@tanstack/react-query";
import {bootstrapBoundTrainingTimers} from "./features/training/trainingGlobalTimer";
import type {ReviewsSourceLoader} from "./features/training/CourseReviewsPanel";
import {listTrainingDays,type TrainingDaysOverview,type TrainingDaySummary}
  from "./features/training/trainingDaysApi";
import {getTrainingDay,type TrainingDayDetail} from "./features/training/trainingDayApi";
import {loadCourseReviewsRaw} from "./features/training/courseReviewsApi";
import {getTodayDailyCourse,sourceOnlyDailyDayGet,
  type DailyToday} from "./features/daily-course/dailyCourseApi";
import type {DailyReadOnlyLoader} from "./features/daily-course/DailyCoursePanel";

import type {GuidesSourceMock} from "./features/gafus/guidesReadApi";
import type {PartnerSourceWire} from "./features/partner/partnerReadApi";
import type {WalletSourceMock} from "./features/gafus/walletReadApi";
import type {NotificationReadWire} from "./features/moments/notificationsReadApi";

import type {VetHonoSourceReadWire} from "./features/pets/vetVisitsHonoReadConsumer";


import {NextTourHost} from "./features/profile/NextTourHost";
import type {ConsultationsReadLoaders} from "./features/consultations/ConsultationReadOnlyPanel";
import type {BookingSourceMockTransport} from "./features/consultations/bookingSourceMock";
import type {AlbumSummary,AlbumPhoto,GalleryPage} from "./features/gallery/galleryApi";

import { GafusHeader } from "./brand/GafusHeader";
import { GafusFooter } from "./brand/GafusFooter";


import { useCurrentUser } from "./shared/auth/useAuth";


import {
  articleSlugFromPath, courseIdFromPath, questionIdFromPath, questionEditIdFromPath,
  petVetVisitsIdFromPath, galleryAlbumIdFromPath,trainingRouteFromPath,trainingReviewsTypeFromPath,
  dailyScheduleIdFromPath,consultationRouteFromPath,consultationCallIdFromPath,
  consultationLegacyConfirmPath,momentIdFromPath,chatDialogIdFromPath,
  momentDraftIdFromPath, momentProfileUsernameFromPath,
  RouteLink, navigate, useRoutePath, useRouteSearch, legacyMomentEditId, type RoutePath,
} from "./shared/router/location";

// Guest/login/registration and opt-in excuses must not inflate authenticated routes.
// The App-level DeferredReadRoute below owns loading and chunk error recovery.
const AuthPanel = lazy(() => import("./shared/auth/AuthPanel")
  .then(module => ({ default: module.AuthPanel })));
const PublicLanding = lazy(() => import("./brand/PublicLanding")
  .then(module => ({ default: module.PublicLanding })));
const EmailConfirmPage = lazy(() => import("./features/account/EmailConfirmPage")
  .then(module => ({ default: module.EmailConfirmPage })));
const PasswordResetRequest = lazy(() => import("./shared/auth/PasswordRecovery")
  .then(module => ({ default: module.PasswordResetRequest })));
const PasswordResetConfirm = lazy(() => import("./shared/auth/PasswordRecovery")
  .then(module => ({ default: module.PasswordResetConfirm })));
const VkConsentWeb = lazy(() => import("./shared/auth/VkConsentWeb")
  .then(module => ({ default: module.VkConsentWeb })));
const ExcusesOptIn = lazy(() => import("./features/excuses/ExcusesOptIn")
  .then(module => ({ default: module.ExcusesOptIn })));

// Messenger includes realtime, media rendering and moderation. Load it only on /chats.
const Chat2Messenger = lazy(() => import("./features/chats/Chat2Messenger")
  .then(module => ({ default: module.Chat2Messenger })));

// Route-specific screens are imported on demand, not in the first Web payload.
// Keep auth/session fencing and the header eager so navigation is never blocked.
const AchievementsOptIn = lazy(() => import("./features/achievements/AchievementsOptIn").then(module => ({ default: module.AchievementsOptIn })));
const CourseCatalog = lazy(() => import("./features/courses/CourseCatalog").then(module => ({ default: module.CourseCatalog })));
const CourseOverview = lazy(() => import("./features/courses/CourseOverview").then(module => ({ default: module.CourseOverview })));
const TrainingIndexOptInHarness = lazy(() => import("./features/training/TrainingIndexOptInHarness").then(module => ({ default: module.TrainingIndexOptInHarness })));
const PaidTrainingPreview = lazy(() => import("./features/training/PaidTrainingPreview").then(module => ({ default: module.PaidTrainingPreview })));
const SubscriptionCheckout = lazy(() => import("./features/commerce/SubscriptionCheckout").then(module => ({ default: module.SubscriptionCheckout })));
const CourseReviewsOptIn = lazy(() => import("./features/training/CourseReviewsOptIn").then(module => ({ default: module.CourseReviewsOptIn })));
const DailyCourseOptInHarness = lazy(() => import("./features/daily-course/DailyCourseOptInHarness").then(module => ({ default: module.DailyCourseOptInHarness })));
const MomentsNotificationsOptIn = lazy(() => import("./features/moments/MomentsNotificationsOptIn").then(module => ({ default: module.MomentsNotificationsOptIn })));
const HiddenAuthorsOptIn = lazy(() => import("./features/moments/HiddenAuthorsOptIn").then(module => ({ default: module.HiddenAuthorsOptIn })));
const WalletOptIn = lazy(() => import("./features/gafus/WalletOptIn").then(module => ({ default: module.WalletOptIn })));
const GuidesOptIn = lazy(() => import("./features/gafus/GuidesOptIn").then(module => ({ default: module.GuidesOptIn })));
const PartnerOptIn = lazy(() => import("./features/partner/PartnerOptIn").then(module => ({ default: module.PartnerOptIn })));
const PetDetails = lazy(() => import("./features/pets/PetDetails").then(module => ({ default: module.PetDetails })));
const PetCreateConnectedPage = lazy(() => import("./features/pets/PetCreateConnectedPage").then(module => ({ default: module.PetCreateConnectedPage })));
const PetVetVisits = lazy(() => import("./features/pets/PetVetVisits").then(module => ({ default: module.PetVetVisits })));
const ProfileOverview = lazy(() => import("./features/profile/ProfileOverview").then(module => ({ default: module.ProfileOverview })));
const AccountDeleteConnected = lazy(() => import("./features/profile/AccountDeleteConnected").then(module => ({ default: module.AccountDeleteConnected })));
const RemindersConnectedPage = lazy(() => import("./features/profile/RemindersConnectedPage").then(module => ({ default: module.RemindersConnectedPage })));
const ConsultationOptInHarness = lazy(() => import("./features/consultations/ConsultationOptInHarness").then(module => ({ default: module.ConsultationOptInHarness })));
const ConsultationsLivePage = lazy(() => import("./features/consultations/ConsultationsLivePage").then(module => ({ default: module.ConsultationsLivePage })));
const AccountMutationPage = lazy(() => import("./features/account/AccountMutationPage").then(module => ({ default: module.AccountMutationPage })));
const UsernameChangePage = lazy(() => import("./features/account/UsernameChangePage").then(module => ({ default: module.UsernameChangePage })));

// Keep standalone articles, pets and public profile views demand-loaded too.
const ArticleCatalog = lazy(() => import("./features/articles/ArticleCatalog")
  .then(module => ({ default: module.ArticleCatalog })));
const ArticleDetails = lazy(() => import("./features/articles/ArticleDetails")
  .then(module => ({ default: module.ArticleDetails })));
const PetCollection = lazy(() => import("./features/pets/PetCollection")
  .then(module => ({ default: module.PetCollection })));
const PublicProfileView = lazy(() => import("./features/profile/PublicProfileView")
  .then(module => ({ default: module.PublicProfileView })));

/** A rejected module import may stay rejected in the browser's module map.
 * Retry by reloading the same URL, not by looping a cached lazy promise.
 * This boundary is mounted inside the existing authentication/session checks,
 * and handles both read pages and private owner-only page chunks. */
class ReadChunkErrorBoundary extends Component<
  { children: ReactNode }, { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <section className="empty-state" role="alert">
      <p>Не удалось загрузить раздел. Проверьте соединение и попробуйте ещё раз.</p>
      <button type="button" onClick={() => window.location.reload()}>
        Перезагрузить страницу
      </button>
    </section>;
    return this.props.children;
  }
}
function Chat2LegacyRedirect() {
  useEffect(() => { navigate("/chats"); }, []);
  return <main className="shell"><Loading message="Открываем Сообщения…" /></main>;
}

function DeferredReadRoute({ children, loading }: { children: ReactNode; loading: string }) {
  return <ReadChunkErrorBoundary>
    <Suspense fallback={<Loading message={loading} variant="screen" />}>
      {children}
    </Suspense>
  </ReadChunkErrorBoundary>;
}

// Load community UI only when that route is visited: keep the initial
// login/catalog bundle small without a new router or PWA worker.
const QuestionCatalog = lazy(() => import("./features/questions/QuestionCatalog")
  .then(module => ({ default: module.QuestionCatalog })));
const QuestionDetails = lazy(() => import("./features/questions/QuestionDetails")
  .then(module => ({ default: module.QuestionDetails })));
const QuestionCreate = lazy(() => import("./features/questions/QuestionCreate")
  .then(module => ({ default: module.QuestionCreate })));

const MomentsCatalog = lazy(() => import("./features/moments/MomentsCatalog")
  .then(module => ({ default: module.MomentsCatalog })));
const MomentDetails = lazy(() => import("./features/moments/MomentDetails")
  .then(module => ({ default: module.MomentDetails })));
const MomentsSaved = lazy(() => import("./features/moments/MomentsSaved")
  .then(module => ({ default: module.MomentsSaved })));
const MomentComposer = lazy(() => import("./features/moments/MomentComposer")
  .then(module => ({ default: module.MomentComposer })));
const MomentLegacyEditRoute = lazy(() => import("./features/moments/MomentLegacyEditRoute")
  .then(module => ({ default: module.MomentLegacyEditRoute })));
const MomentDrafts = lazy(() => import("./features/moments/MomentDrafts")
  .then(module => ({ default: module.MomentDrafts })));
const MomentsProfile = lazy(() => import("./features/moments/MomentsProfile")
  .then(module => ({ default: module.MomentsProfile })));



/** Composer only, not another training screen: resolve server catalog
 * type+entitlement then reuse existing TrainingIndexOptInHarness. */
function TrainingRouteOwnerGate({userId,courseType,dayId,loadDays,loadDay,reviewsLoader}:{
 userId:string;courseType:string;dayId:string|null;
 loadDays:(type:string)=>Promise<TrainingDaysOverview>;
 loadDay:(type:string,day:TrainingDaySummary)=>Promise<TrainingDayDetail>;
 reviewsLoader?:ReviewsSourceLoader;
}){
 const catalog=useQuery({queryKey:["courses","catalog",userId],
  queryFn:()=>listCourses(),retry:false,staleTime:0,gcTime:0});
 const freshCatalog=catalog.isSuccess&&!catalog.isFetching?catalog.data:undefined;
 const allowed=freshCatalog?.find(course=>course.type===courseType&&course.hasAccess===true);
 const paidPreview=freshCatalog?.find(course=>course.type===courseType&&
   course.hasAccess===false&&course.isPaid===true&&course.isPrivate===false);
 return <section aria-label="Доступ к тренировке">
  {catalog.isPending&&<Loading message="Проверяем доступ к курсу…" />}
  {catalog.isError&&<div role="alert" className="empty-state">
    <p>{catalog.error instanceof ApiError&&catalog.error.status===401
      ? "Сессия завершена. Войдите снова."
      : catalog.error instanceof ApiError&&catalog.error.status===403
        ? "Нет доступа к этому курсу."
        : "Не удалось подтвердить доступ к курсу."}</p>
    {catalog.error instanceof ApiError&&catalog.error.status===401
      ? <RouteLink to="/login">Войти</RouteLink>
      : !(catalog.error instanceof ApiError&&catalog.error.status===403)
        ? <button type="button" onClick={()=>void catalog.refetch()}>Повторить загрузку</button>
        : null}
  </div>}
  {catalog.isSuccess&&!catalog.isFetching&&!allowed&&!paidPreview&&
    <p role="alert">Курс недоступен или не найден.</p>}
  {paidPreview&&!reviewsLoader&&<PaidTrainingPreview
    userId={userId} courseType={courseType} dayId={dayId}/>}
  {allowed&&reviewsLoader&&<CourseReviewsOptIn enabled userId={userId}
    courseType={courseType} loadReviews={reviewsLoader}/>}
  {allowed&&!reviewsLoader&&<TrainingIndexOptInHarness enabled userId={userId}
    courseType={courseType} courseName={allowed.name}
    loadDays={loadDays} loadDay={loadDay} showStepsOptIn
    routeMode routeDayId={dayId}/>}
 </section>;
}

function MainView({route,showExcusesOptIn=false,excusesSyntheticFixture,
 showAchievementsOptIn=false,achievementsSyntheticTransport,achievementsEntitlement,
 showGalleryOptIn=false,galleryAlbumLoader,galleryDetailLoader,galleryPhotoLoader,
 showTrainingFlowOptIn=false,trainingDaysLoader,trainingDayLoader,trainingReviewsLoader,
 dailyTodayLoader,dailyDayLoader,
 showConsultationsFlowOptIn=false,consultationsLoaders,
 consultationsNow,consultationsBookingMockTransport,
 showVetHonoOptIn=false,vetHonoReadTransport,
 showNotificationsRouteOptIn=false,notificationsRouteWire,
 showWalletRouteOptIn=false,walletRouteWire,
 showGuidesRouteOptIn=false,guidesRouteWire,
 showPartnerRouteOptIn=false,partnerRouteWire}:{
 route:RoutePath;showExcusesOptIn?:boolean;
 excusesSyntheticFixture?:ExcuseFixture;
 showAchievementsOptIn?:boolean;
 achievementsSyntheticTransport?:SyntheticAchievementTransport;
 achievementsEntitlement?:ServerAchievementsEntitlementWire;
 showGalleryOptIn?:boolean;
 galleryAlbumLoader?:(id:string,username:string,cursor:string|null)=>
   Promise<GalleryPage<AlbumSummary>>;
 galleryDetailLoader?:(id:string,ownerId:string,username:string)=>Promise<AlbumSummary>;
 galleryPhotoLoader?:(id:string,cursor:string|null)=>Promise<GalleryPage<AlbumPhoto>>;
 showTrainingFlowOptIn?:boolean;
 trainingDaysLoader?:(type:string)=>Promise<TrainingDaysOverview>;
 trainingDayLoader?:(type:string,day:TrainingDaySummary)=>Promise<TrainingDayDetail>;
 trainingReviewsLoader?:ReviewsSourceLoader;
 dailyTodayLoader?:()=>Promise<DailyToday>;
 dailyDayLoader?:DailyReadOnlyLoader;
 showConsultationsFlowOptIn?:boolean;
 consultationsLoaders?:ConsultationsReadLoaders;
 consultationsNow?:Date;
 consultationsBookingMockTransport?:BookingSourceMockTransport;
 showVetHonoOptIn?:boolean;vetHonoReadTransport?:VetHonoSourceReadWire;
 showNotificationsRouteOptIn?:boolean;notificationsRouteWire?:NotificationReadWire;
 showWalletRouteOptIn?:boolean;walletRouteWire?:WalletSourceMock;
 showGuidesRouteOptIn?:boolean;guidesRouteWire?:GuidesSourceMock;
 showPartnerRouteOptIn?:boolean;partnerRouteWire?:PartnerSourceWire;
}) {
  const routeSearch=useRouteSearch();
  const profileNames=route==="/profile"?
    new URLSearchParams(routeSearch).getAll("username"):[];
  const publicProfileRequested=profileNames.length>0;
  const publicProfileUsername=profileNames.length===1&&profileNames[0]&&
    profileNames[0].length<=256&&![...profileNames[0]].some(char=>{
      const code=char.charCodeAt(0);
      return code<=31||code===127;
    })?
    profileNames[0]:null;
  const consultationRoute=consultationRouteFromPath(route);
  const consultationCallId=consultationCallIdFromPath(route);
  const consultationLiveRoute=Boolean(consultationRoute||consultationCallId)&&
    !showConsultationsFlowOptIn;
  const legacyConfirm=consultationRoute?.trainerId&&
    route===consultationLegacyConfirmPath(consultationRoute.trainerId);
  const slotParams=new URLSearchParams(routeSearch).getAll("slotId");
  const legacySlotId=legacyConfirm&&slotParams.length===1&&
    /^[A-Za-z0-9_-]{1,128}$/.test(slotParams[0])?
    slotParams[0]:null;
  const consultationRouteView=legacyConfirm&&consultationRoute?
    {...consultationRoute,slotId:legacySlotId??undefined}:
    consultationRoute;
  const trainingRoute=trainingRouteFromPath(route);
  const reviewsType=trainingReviewsTypeFromPath(route);
  const dailyRouteId=dailyScheduleIdFromPath(route);
  const galleryRoute=route==="/profile/albums"||
    galleryAlbumIdFromPath(route)!==null;
  const gallerySearch=new URLSearchParams(routeSearch);
  // Next supports ?username; owner-only source parity excludes foreign
  // albums and duplicate username ambiguity. Other query fields never
  // reach the API or affect a private cache key.
  const rawRequested=gallerySearch.getAll("username");
  const galleryRequestedUsername=rawRequested.length===0?null:
    rawRequested.length===1?rawRequested[0]:""; // invalid duplicate username
  const current = useCurrentUser();
  const authCache=useQueryClient();
  const initialPrincipal=useRef(authCache.getQueryData<AuthUser|null>(
    CURRENT_USER_QUERY_KEY)?.id??null);
  const lastPrincipal=useRef(initialPrincipal.current);
  const ownerEpoch=useRef(0);
  const authRevision=useSyncExternalStore(callback=>
    authCache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
        event.query.queryKey.every((v:unknown,i:number)=>v===CURRENT_USER_QUERY_KEY[i])){
        const next=authCache.getQueryData<AuthUser|null>(
          CURRENT_USER_QUERY_KEY)?.id??null;
        if(next!==lastPrincipal.current&&(next!==null||
          event.type==="removed"||event.query.state.data===null)){
          lastPrincipal.current=next;
          ownerEpoch.current++;
          callback();
        }
      }
    }),()=>ownerEpoch.current,()=>ownerEpoch.current);
  const userId = current.data?.id ?? null;
  // Preserve the private owner isolation fence even across A→B→A changes.
  // The outer route boundary prevents anonymous private-page rendering.
  const hiddenAuthorsRoute=route==="/feed/hidden-authors";
  const remindersRoute=route==="/reminders";
  const chatOwnerRoute=route==="/chats" || /^\/chats\/[A-Za-z0-9_-]{1,128}$/.test(route??"") ||
    route==="/cynologist-chat" || chatDialogIdFromPath(route ?? "")!==null;

  // The ordinary registered Hono vet route requires the same App-lifetime
  // session fence as the owner gallery; its child is remounted on A→B.
  const vetOwnerRoute=petVetVisitsIdFromPath(route)!==null;
  const courseReadRoute=(trainingRoute!==null||reviewsType!==null);
  // On a real cold browser navigation, /auth/me resolves asynchronously:
  // MainView initially sees no cached principal, then the FIRST verified
  // success delivers it. One null→owner transition is initial hydration, not
  // an owner switch. All subsequent changes (A→B→A, logout, removals) bump
  // the revision further and remain fail-closed; the outer App-lifetime fence
  // still verifies role/sessionRevision, denied/ambiguous auth and logout.
  const coldAuthBootstrap=initialPrincipal.current===null&&authRevision===1&&
    current.isSuccess&&!current.isFetching&&userId!==null;
  const stableOwner=(initialPrincipal.current===userId&&authRevision===0||
    coldAuthBootstrap)&&
    authCache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId;
  // App-lifetime owner gate: a verified timer continues across route changes
  // and completes via fresh Hono/Core GET even after its accordion unmounts.
  useEffect(()=>{
    if(stableOwner && userId) bootstrapBoundTrainingTimers(userId);
  },[stableOwner,userId]);
  // A linked Gallery flow spans profile and pets as well as albums.
  // Guard every PRIVATE route, but never show session-change warnings on
  // the public landing/login/recovery pages for a fresh unauthenticated user.
  const gallerySessionRoute=showGalleryOptIn&&!NEXT_PUBLIC_WEB_ROUTES.has(route);
  const connectedSessionSafe=!(
    gallerySessionRoute||showTrainingFlowOptIn||showConsultationsFlowOptIn||
    showVetHonoOptIn||showNotificationsRouteOptIn||showWalletRouteOptIn||
    showGuidesRouteOptIn||showPartnerRouteOptIn||hiddenAuthorsRoute||
    courseReadRoute||remindersRoute||consultationLiveRoute||chatOwnerRoute||vetOwnerRoute)||
    stableOwner;
  // The public root is ONLY the original Next landing presentation.
  // A verified, stable signed-in principal goes straight to /courses.
  // Do not mount catalog queries under /, even during auth hydration.
  useEffect(()=>{
    if(route==="/" && userId && current.isSuccess && !current.isFetching &&
      stableOwner && connectedSessionSafe) navigate("/courses");
  },[route,userId,current.isSuccess,current.isFetching,stableOwner,connectedSessionSafe]);
  // The favorites experience is not released. A saved /favorites bookmark
  // resolves to the regular catalog without mounting private favorites data.
  useEffect(() => {
    if (route === "/favorites") navigate("/courses");
  }, [route]);
  const catalogPage = route === "/courses";
  const courseId = courseIdFromPath(route);
  return (
    <div className="gafus-app">
      <a className="skip-to-content" href="#main-content"
        onClick={event=>{
          // Native anchor supports Tab/Enter without changing query/hash.
          const target=document.getElementById("main-content");
          if(!target)return;
          event.preventDefault();
          target.focus();
        }}>К содержимому</a>
      <GafusHeader authenticated={Boolean(userId)}
        role={userId && current.isSuccess && !current.isFetching ? current.data?.role : null}
        showAchievements={showAchievementsOptIn &&
          Boolean(achievementsSyntheticTransport && achievementsEntitlement)} />
      <main className="shell">
      <div id="main-content" role="region" aria-label="Содержимое страницы"
        tabIndex={-1}>
      {(gallerySessionRoute||showTrainingFlowOptIn||
        showConsultationsFlowOptIn||showVetHonoOptIn||
        showNotificationsRouteOptIn||showWalletRouteOptIn||
        showGuidesRouteOptIn||showPartnerRouteOptIn||hiddenAuthorsRoute||
        courseReadRoute||remindersRoute||consultationLiveRoute||vetOwnerRoute)&&current.isSuccess&&
        !connectedSessionSafe&&
        <section role="alert" aria-label="Защита сессии связанных разделов">
          <p>Сессия изменилась. Откройте приложение заново.</p>
        </section>}
      {/* Landing is PUBLIC. A broken Hono auth check must not blank the
           presentation. Only verified signed-in principals get redirected. */}
      {route === "/" && !userId &&
        <PublicLanding loadStats={current.isSuccess||current.isError} />}
      {current.isSuccess && connectedSessionSafe && (
        // Private component-local drafts, upload previews and request keys
        // must not survive a principal change at the same route.
        <ReadChunkErrorBoundary key={route}>
          <Suspense fallback={<Loading message="Загружаем раздел…" variant="screen" />}>
        <Fragment key={userId ? "user:" + userId : "public"}>
          {catalogPage && userId && <CourseCatalog key={route} userId={userId}
            showDailyCourseOptIn={route === "/courses"}
            dailyTodayLoader={dailyTodayLoader ?? getTodayDailyCourse}
            dailyDayLoader={dailyDayLoader ?? sourceOnlyDailyDayGet}
            dailyRouteMode/>}
          {userId && courseId && <CourseOverview userId={userId} courseId={courseId}
            connectedRoute
            showTrainingDaysOptIn={showTrainingFlowOptIn&&
              !!trainingDaysLoader&&!!trainingDayLoader}
            trainingDaysLoader={trainingDaysLoader}
            trainingDayLoader={trainingDayLoader}
            showTrainingStepsOptIn={showTrainingFlowOptIn}
            trainingRouteMode={showTrainingFlowOptIn}
            showReviewsLink={showTrainingFlowOptIn&&!!trainingReviewsLoader}/>}
          {publicProfileRequested && route === "/profile" &&
            (publicProfileUsername ?
              <DeferredReadRoute key={publicProfileUsername}
                loading="Загружаем публичный профиль…">
                <PublicProfileView username={publicProfileUsername}
                  hasOwner={!!userId}/>
              </DeferredReadRoute> :
              <section role="alert"><p>Некорректный адрес публичного профиля.</p>
                <RouteLink to="/profile">Мой профиль</RouteLink></section>)}
          {userId && route === "/profile/delete-account" && current.data &&
            <AccountDeleteConnected key={userId} ownerId={userId}
              username={current.data.username}/>}
          {userId && !publicProfileRequested &&
            (route === "/profile" || route === "/profile/editBio") &&
            <ProfileOverview key={userId + ":" + route} userId={userId}
              editMode={route === "/profile/editBio"}
              showGalleryOptIn={showGalleryOptIn}
              galleryNavOnly={showGalleryOptIn}
              trainingNavOnly={showTrainingFlowOptIn}
              showConsultationsOptIn={showConsultationsFlowOptIn}
              consultationsNavOnly={showConsultationsFlowOptIn}
              galleryAlbumLoader={galleryAlbumLoader}
              galleryDetailLoader={galleryDetailLoader}
              galleryPhotoLoader={galleryPhotoLoader}
              showAchievementsOptIn={showAchievementsOptIn}
              achievementsSyntheticTransport={achievementsSyntheticTransport}
              achievementsEntitlement={achievementsEntitlement} />}
          {userId && !publicProfileRequested &&
            (route === "/profile" || route === "/profile/editBio") &&
            <nav aria-label="Настройки аккаунта" className="account-links">
              <RouteLink to="/reminders">Напоминания о тренировках</RouteLink>
              <RouteLink to="/profile/change-email">Изменить email</RouteLink>
              <RouteLink to="/profile/set-password">Установить пароль</RouteLink>
              <RouteLink to="/profile/change-password">Сменить пароль</RouteLink>
              <RouteLink to="/profile/change-username">Изменить логин</RouteLink>
            </nav>}
          {userId && !publicProfileRequested && route === "/profile" && showWalletRouteOptIn &&
            walletRouteWire?.fixtureKind==="AG2_WALLET_SYNTHETIC_SELF_GET_ONLY" &&
            <p className="wallet-route-entry"><RouteLink to="/gafus">
              Мои гафусы (макет)
            </RouteLink></p>}
          {userId && route === "/gafus" && showWalletRouteOptIn &&
            walletRouteWire?.fixtureKind==="AG2_WALLET_SYNTHETIC_SELF_GET_ONLY" &&
            <WalletOptIn enabled routeMode key={userId+":wallet-route"}
              ownerId={userId} transport={walletRouteWire}/>}
          {userId && !publicProfileRequested &&
            (route === "/profile" || route==="/gafus") &&
            showGuidesRouteOptIn &&
            guidesRouteWire?.fixtureKind==="AG2_GUIDES_SYNTHETIC_GET_ONLY" &&
            <p className="guides-route-entry"><RouteLink to="/gafus/guides">
              Мини-гайды за гафусы (макет)
            </RouteLink></p>}
          {userId && route === "/gafus/guides" && showGuidesRouteOptIn &&
            guidesRouteWire?.fixtureKind==="AG2_GUIDES_SYNTHETIC_GET_ONLY" &&
            <GuidesOptIn enabled routeMode key={userId+":guides-route"}
              ownerId={userId} transport={guidesRouteWire}/>}
          {userId && !publicProfileRequested && route === "/profile" &&
            current.data?.role==="PARTNER" &&
            showPartnerRouteOptIn &&
            partnerRouteWire?.fixtureKind==="AG2_PARTNER_READONLY_SYNTHETIC" &&
            <p className="partner-route-entry"><RouteLink to="/partner">
              Партнёрский кабинет (макет)
            </RouteLink></p>}
          {userId && route === "/partner" && current.data?.role==="PARTNER" &&
            showPartnerRouteOptIn &&
            partnerRouteWire?.fixtureKind==="AG2_PARTNER_READONLY_SYNTHETIC" &&
            <PartnerOptIn enabled routeMode key={userId+":partner-route"}
              ownerId={userId} transport={partnerRouteWire}/>}
          {userId && remindersRoute&&
            <RemindersConnectedPage key={userId+":reminders-live"} ownerId={userId}/>}
          {userId && route === "/profile/change-email" &&
            <AccountMutationPage key={userId + ":email"} actorId={userId} mode="email" />}
          {userId && route === "/profile/set-password" &&
            <AccountMutationPage key={userId + ":set"} actorId={userId} mode="set" />}
          {userId && route === "/profile/change-password" &&
            <AccountMutationPage key={userId + ":change"} actorId={userId} mode="change" />}
          {userId && route === "/profile/change-username" && current.data &&
            <UsernameChangePage key={userId + ":username"} actorId={userId}
              currentUsername={current.data.username} />}
          {userId && route === "/achievements" &&
            <AchievementsOptIn key={userId+":achievements-route"} enabled
              ownerId={userId} transport={achievementsSyntheticTransport}
              entitlement={achievementsEntitlement}/>}
          {userId&&trainingRoute&&
            <TrainingRouteOwnerGate
              key={userId+":"+trainingRoute.courseType+":"+
                (trainingRoute.dayId??"index")} userId={userId}
              courseType={trainingRoute.courseType}
              dayId={trainingRoute.dayId} loadDays={trainingDaysLoader??listTrainingDays}
              loadDay={trainingDayLoader??getTrainingDay}/>}
          {userId&&reviewsType&&
            <TrainingRouteOwnerGate key={userId+":"+reviewsType+":reviews"}
              userId={userId} courseType={reviewsType} dayId={null}
              loadDays={trainingDaysLoader??listTrainingDays}
              loadDay={trainingDayLoader??getTrainingDay}
              reviewsLoader={trainingReviewsLoader??loadCourseReviewsRaw}/>}
          {userId&&dailyRouteId&&
            <DailyCourseOptInHarness key={userId+":"+dailyRouteId}
              enabled userId={userId}
              loadToday={dailyTodayLoader ?? getTodayDailyCourse}
              loadDay={dailyDayLoader ?? sourceOnlyDailyDayGet}
              enableConnectedProgress={!dailyDayLoader}
              routeMode routeScheduleId={dailyRouteId}/>}
          {userId&&consultationLiveRoute&&<ConsultationsLivePage
            key={userId+":"+route+":"+routeSearch}
            userId={userId} username={current.data?.username??""}
            view={consultationRouteView} bookingId={consultationCallId}/>}
          {userId&&consultationRoute&&showConsultationsFlowOptIn&&
            consultationsLoaders?.specialists&&consultationsLoaders?.slots&&
            consultationsLoaders?.mine&&
            <ConsultationOptInHarness enabled userId={userId}
              username={current.data?.username??null}
              loaders={consultationsLoaders} now={consultationsNow}
              bookingMockTransport={consultationsBookingMockTransport}
              routeMode routeView={consultationRouteView}/>}
          {userId && galleryRoute&&showGalleryOptIn&&
            <ProfileOverview key={userId+":"+route} userId={userId}
              galleryRouteMode showGalleryOptIn
              galleryRouteAlbumId={galleryAlbumIdFromPath(route)}
              galleryRequestedUsername={galleryRequestedUsername}
              galleryAlbumLoader={galleryAlbumLoader}
              galleryDetailLoader={galleryDetailLoader}
              galleryPhotoLoader={galleryPhotoLoader}/>}
          {userId && route === "/pets" &&
            <DeferredReadRoute loading="Загружаем питомцев…">
              <PetCollection userId={userId} galleryOptIn={showGalleryOptIn} addPetOptIn/>
            </DeferredReadRoute>}
          {userId && route === "/profile/addPet" &&
            <PetCreateConnectedPage key={userId} userId={userId}/>}
          {userId && route.startsWith("/pets/") &&
            !petVetVisitsIdFromPath(route) &&
            <PetDetails userId={userId} petId={route.slice("/pets/".length)}
              galleryOptIn={showGalleryOptIn}/>}
          {userId && petVetVisitsIdFromPath(route) &&
            <PetVetVisits userId={userId} petId={petVetVisitsIdFromPath(route)!}
              showVetHonoOptIn={showVetHonoOptIn}
              vetHonoReadTransport={vetHonoReadTransport}/>}
          {userId && route === "/feed/notifications" &&
            <MomentsNotificationsOptIn enabled routeMode key={userId+":notification-route"}
              ownerId={userId} transport={notificationsRouteWire}/>}
          {userId && hiddenAuthorsRoute &&
            <HiddenAuthorsOptIn enabled routeMode key={userId+":hidden-authors-route"}
              ownerId={userId}/>}
          {userId && route === "/subscription" &&
            <SubscriptionCheckout key={userId} ownerId={userId} search={routeSearch}/>}
          {route === "/articles" &&
            <DeferredReadRoute loading="Загружаем статьи…">
              <ArticleCatalog userId={userId}/>
            </DeferredReadRoute>}
          {userId && (route === "/questions" || route === "/questions/new" ||
            questionIdFromPath(route) || questionEditIdFromPath(route)) && <Suspense fallback={
              <Loading message="Загружаем раздел «Вопросы»…" />
            }>
            {route === "/questions" && <QuestionCatalog userId={userId} />}
            {route === "/questions/new" && <QuestionCreate userId={userId} />}
            {questionIdFromPath(route) &&
              <QuestionDetails key={questionIdFromPath(route)!} userId={userId}
                questionId={questionIdFromPath(route)!} />}
            {questionEditIdFromPath(route) &&
              <QuestionDetails key={"edit-" + questionEditIdFromPath(route)!}
                userId={userId} questionId={questionEditIdFromPath(route)!}
                editMode />}
          </Suspense>}
          {userId && (route === "/moments" || route === "/moments/saved" ||
            route === "/moments/new" || route === "/moments/drafts" ||
            momentDraftIdFromPath(route) || momentProfileUsernameFromPath(route) ||
            momentIdFromPath(route)) &&
            <Suspense fallback={<Loading message="Загружаем «Моменты»…" />}>
              {route === "/moments" && <MomentsCatalog userId={userId} />}
              {route === "/moments/saved" && <MomentsSaved userId={userId} />}
              {route === "/moments/new" &&
                (legacyMomentEditId(routeSearch) === undefined
                  ? <MomentComposer userId={userId} />
                  : legacyMomentEditId(routeSearch) === null
                    ? <p role="alert">Недопустимая ссылка редактирования публикации.</p>
                    : <MomentLegacyEditRoute key={userId + ":" + routeSearch}
                        userId={userId} editId={legacyMomentEditId(routeSearch)!} />)}
              {route === "/moments/drafts" && <MomentDrafts userId={userId} />}
              {momentDraftIdFromPath(route) &&
                <MomentComposer key={momentDraftIdFromPath(route)!}
                  userId={userId} draftId={momentDraftIdFromPath(route)!} />}
              {momentProfileUsernameFromPath(route) &&
                <MomentsProfile key={momentProfileUsernameFromPath(route)!}
                  userId={userId} username={momentProfileUsernameFromPath(route)!} />}
              {momentIdFromPath(route) &&
                <MomentDetails key={momentIdFromPath(route)!}
                  userId={userId} postId={momentIdFromPath(route)!} />}
            </Suspense>}
          {articleSlugFromPath(route) &&
            <DeferredReadRoute key={route} loading="Загружаем статью…">
              <ArticleDetails key={(userId ?? "anonymous") + ":" + articleSlugFromPath(route)!}
                userId={userId} slug={articleSlugFromPath(route)!}/>
            </DeferredReadRoute>}
        </Fragment>
          </Suspense>
        </ReadChunkErrorBoundary>
      )}
      {catalogPage&&<ExcusesOptIn enabled={showExcusesOptIn}
        fixture={excusesSyntheticFixture}/>}
      </div>
      </main>
      <NextTourHost ownerId={current.isSuccess?userId:null}/>
      <GafusFooter />
    </div>
  );
}

function AppRouter({showExcusesOptIn=false,excusesSyntheticFixture,
 showAchievementsOptIn=false,achievementsSyntheticTransport,achievementsEntitlement,
 showGalleryOptIn=false,galleryAlbumLoader,galleryDetailLoader,galleryPhotoLoader,
 showTrainingFlowOptIn=false,trainingDaysLoader,trainingDayLoader,trainingReviewsLoader,
 dailyTodayLoader,dailyDayLoader,
 showConsultationsFlowOptIn=false,consultationsLoaders,
 consultationsNow,consultationsBookingMockTransport,
 showVetHonoOptIn=false,vetHonoReadTransport,
 showNotificationsRouteOptIn=false,notificationsRouteWire,
 showWalletRouteOptIn=false,walletRouteWire,
 showGuidesRouteOptIn=false,guidesRouteWire,
 showPartnerRouteOptIn=false,partnerRouteWire}:{
 showExcusesOptIn?:boolean;excusesSyntheticFixture?:ExcuseFixture;
 showAchievementsOptIn?:boolean;
 achievementsSyntheticTransport?:SyntheticAchievementTransport;
 achievementsEntitlement?:ServerAchievementsEntitlementWire;
 showGalleryOptIn?:boolean;
 galleryAlbumLoader?:(id:string,username:string,cursor:string|null)=>
   Promise<GalleryPage<AlbumSummary>>;
 galleryDetailLoader?:(id:string,ownerId:string,username:string)=>Promise<AlbumSummary>;
 galleryPhotoLoader?:(id:string,cursor:string|null)=>Promise<GalleryPage<AlbumPhoto>>;
 showTrainingFlowOptIn?:boolean;
 trainingDaysLoader?:(type:string)=>Promise<TrainingDaysOverview>;
 trainingDayLoader?:(type:string,day:TrainingDaySummary)=>Promise<TrainingDayDetail>;
 trainingReviewsLoader?:ReviewsSourceLoader;
 dailyTodayLoader?:()=>Promise<DailyToday>;
 dailyDayLoader?:DailyReadOnlyLoader;
 showConsultationsFlowOptIn?:boolean;
 consultationsLoaders?:ConsultationsReadLoaders;
 consultationsNow?:Date;
 consultationsBookingMockTransport?:BookingSourceMockTransport;
 showVetHonoOptIn?:boolean;vetHonoReadTransport?:VetHonoSourceReadWire;
 showNotificationsRouteOptIn?:boolean;notificationsRouteWire?:NotificationReadWire;
 showWalletRouteOptIn?:boolean;walletRouteWire?:WalletSourceMock;
 showGuidesRouteOptIn?:boolean;guidesRouteWire?:GuidesSourceMock;
 showPartnerRouteOptIn?:boolean;partnerRouteWire?:PartnerSourceWire;
}={}) {
  const path = useRoutePath();
  const search=useRouteSearch();
  if (path==="/chats" || (path?.startsWith("/chats/") && /^\/chats\/[A-Za-z0-9_-]{1,128}$/.test(path))) return <DeferredReadRoute loading="Загружаем сообщения…"><Chat2Messenger/></DeferredReadRoute>;
  // Legacy Stream/cynologist URLs no longer load legacy components or APIs.
  if (path==="/cynologist-chat" || (path && chatDialogIdFromPath(path))) return <Chat2LegacyRedirect/>;
  switch (path) {
    case "/otmazki":
      if(!showExcusesOptIn||excusesSyntheticFixture?.fixtureKind!==
        "AG2_PUBLIC_EXCUSES_SYNTHETIC_PROVIDER_ONLY")return (
        <main className="shell"><h1>Страница не найдена</h1>
          <RouteLink to="/">На главную</RouteLink></main>);
      return <main className="shell public-excuses-route">
        <header className="app-header"><h1>Гафус</h1></header>
        <ExcusesOptIn enabled fixture={excusesSyntheticFixture} routeMode/>
      </main>;
    case "/login":
    case "/register":
      return <main className="shell gafus-auth-screen" data-app-background="auth"><h1 className="gafus-visually-hidden">
        {path === "/register" ? "Регистрация" : "Вход"}
      </h1><AuthPanel /></main>;
    case "/gafus/guides":
      if(!showGuidesRouteOptIn||
        guidesRouteWire?.fixtureKind!=="AG2_GUIDES_SYNTHETIC_GET_ONLY")return (
        <main className="shell"><h1>Страница не найдена</h1>
          <RouteLink to="/profile">Перейти в профиль</RouteLink></main>);
      return <MainView route={path} showGuidesRouteOptIn
        guidesRouteWire={guidesRouteWire}/>;
    case "/partner":
      if(!showPartnerRouteOptIn||
        partnerRouteWire?.fixtureKind!=="AG2_PARTNER_READONLY_SYNTHETIC")return (
        <main className="shell"><h1>Страница не найдена</h1>
          <RouteLink to="/profile">Перейти в профиль</RouteLink></main>);
      return <MainView route={path} showPartnerRouteOptIn
        partnerRouteWire={partnerRouteWire}/>;
    case "/gafus":
      if(!showWalletRouteOptIn||
        walletRouteWire?.fixtureKind!=="AG2_WALLET_SYNTHETIC_SELF_GET_ONLY")return (
        <main className="shell"><h1>Страница не найдена</h1>
          <RouteLink to="/profile">Перейти в профиль</RouteLink></main>);
      return <MainView route={path} showWalletRouteOptIn
        walletRouteWire={walletRouteWire}/>;
    case "/reminders":
      // WEB046: registered owner-only GET, writes and Web Push remain closed.
      return <MainView route={path}/>;
    case "/feed/notifications":
      // WEB-URL-022 registered owner GET; no fixture gate for actual App route.
      return <MainView route={path} showNotificationsRouteOptIn
        notificationsRouteWire={notificationsRouteWire}/>;
    case "/feed/hidden-authors":
      // WEB-URL-021: actor-scoped read-only AG1 Hono GET, not placeholder.
      return <MainView route={path}/>;
    case "/profile/confirm-email":
      return <EmailConfirmPage />;
    case "/vk-consent":
      return <VkConsentWeb />;
    case "/passwordReset":
      return <main className="shell gafus-reset-screen" data-app-background="auth"><PasswordResetRequest /></main>;
    case "/reset-password":
      return <main className="shell"><PasswordResetConfirm /></main>;
    case "/profile/albums":
      // WEB033: existing AG1 owner GETs, no synthetic opt-in requirement.
      return <MainView route={path} showGalleryOptIn
        galleryAlbumLoader={galleryAlbumLoader}
        galleryDetailLoader={galleryDetailLoader}
        galleryPhotoLoader={galleryPhotoLoader}
        showTrainingFlowOptIn={showTrainingFlowOptIn}
        trainingReviewsLoader={trainingReviewsLoader}
        trainingDaysLoader={trainingDaysLoader}
        trainingDayLoader={trainingDayLoader}
        dailyTodayLoader={dailyTodayLoader}
        dailyDayLoader={dailyDayLoader}
        showConsultationsFlowOptIn={showConsultationsFlowOptIn}
        consultationsLoaders={consultationsLoaders}
        consultationsNow={consultationsNow}
        consultationsBookingMockTransport={consultationsBookingMockTransport}
        showVetHonoOptIn={showVetHonoOptIn}
        vetHonoReadTransport={vetHonoReadTransport}/>;
    case "/achievements":
      // G2 cutover remains closed: no real screen without EXPLICIT
      // synthetic UI transport AND server-entitlement fixture.
      if(!showAchievementsOptIn||!achievementsSyntheticTransport||
        !achievementsEntitlement)return (
        <main className="shell"><h1>Страница не найдена</h1>
          <RouteLink to="/courses">Перейти к курсам</RouteLink></main>);
      return <MainView route={path} showAchievementsOptIn
        achievementsSyntheticTransport={achievementsSyntheticTransport}
        achievementsEntitlement={achievementsEntitlement}
        showGalleryOptIn={showGalleryOptIn}
        galleryAlbumLoader={galleryAlbumLoader}
        galleryDetailLoader={galleryDetailLoader}
        galleryPhotoLoader={galleryPhotoLoader}
        showTrainingFlowOptIn={showTrainingFlowOptIn}
        trainingReviewsLoader={trainingReviewsLoader}
        trainingDaysLoader={trainingDaysLoader}
        trainingDayLoader={trainingDayLoader}
        dailyTodayLoader={dailyTodayLoader}
        dailyDayLoader={dailyDayLoader}
        showConsultationsFlowOptIn={showConsultationsFlowOptIn}
        consultationsLoaders={consultationsLoaders}
        consultationsNow={consultationsNow}
        consultationsBookingMockTransport={consultationsBookingMockTransport}
        showVetHonoOptIn={showVetHonoOptIn}
        vetHonoReadTransport={vetHonoReadTransport}/>;
    case "/":
    case "/courses":
    case "/favorites":
    case "/profile":
    case "/subscription":
    case "/profile/delete-account":
    case "/profile/editBio":
    case "/profile/addPet":
    case "/profile/change-email":
    case "/profile/set-password":
    case "/profile/change-password":
    case "/profile/change-username":
    case "/pets":
    case "/articles":
    case "/questions":
    case "/questions/new":
    case "/moments":
    case "/moments/saved":
    case "/moments/new":
    case "/moments/drafts":
      return <MainView route={path} showExcusesOptIn={showExcusesOptIn}
        showWalletRouteOptIn={showWalletRouteOptIn}
        walletRouteWire={walletRouteWire}
        showGuidesRouteOptIn={showGuidesRouteOptIn}
        guidesRouteWire={guidesRouteWire}
        showPartnerRouteOptIn={showPartnerRouteOptIn}
        partnerRouteWire={partnerRouteWire}
        showNotificationsRouteOptIn={showNotificationsRouteOptIn}
        notificationsRouteWire={notificationsRouteWire}
        excusesSyntheticFixture={excusesSyntheticFixture}
        showAchievementsOptIn={showAchievementsOptIn}
        achievementsSyntheticTransport={achievementsSyntheticTransport}
        achievementsEntitlement={achievementsEntitlement}
        showGalleryOptIn={showGalleryOptIn}
        galleryAlbumLoader={galleryAlbumLoader}
        galleryDetailLoader={galleryDetailLoader}
        galleryPhotoLoader={galleryPhotoLoader}
        showTrainingFlowOptIn={showTrainingFlowOptIn}
        trainingReviewsLoader={trainingReviewsLoader}
        trainingDaysLoader={trainingDaysLoader}
        trainingDayLoader={trainingDayLoader}
        dailyTodayLoader={dailyTodayLoader}
        dailyDayLoader={dailyDayLoader}
        showConsultationsFlowOptIn={showConsultationsFlowOptIn}
        consultationsLoaders={consultationsLoaders}
        consultationsNow={consultationsNow}
        consultationsBookingMockTransport={consultationsBookingMockTransport}
        showVetHonoOptIn={showVetHonoOptIn}
        vetHonoReadTransport={vetHonoReadTransport}/>;
    default:
      if(path&&consultationCallIdFromPath(path)){
        return <MainView route={path}/>;
      }
      if(path&&consultationRouteFromPath(path)){
        const parsed=consultationRouteFromPath(path)!;
        const legacyConfirm=parsed.trainerId&&
          path===consultationLegacyConfirmPath(parsed.trainerId);
        const slotValues=new URLSearchParams(search).getAll("slotId");
        const validLegacySlot=!legacyConfirm||
          (slotValues.length===1&&/^[A-Za-z0-9_-]{1,128}$/.test(slotValues[0]));
        if(!showConsultationsFlowOptIn && validLegacySlot){
          return <MainView route={path}/>;
        }
        if(!validLegacySlot||!showConsultationsFlowOptIn||
          !consultationsLoaders?.specialists||
          !consultationsLoaders?.slots||
          !consultationsLoaders?.mine||
          (parsed.kind==="booking"&&
            consultationsBookingMockTransport?.fixtureKind!==
              "AG2_BOOKING_SYNTHETIC_ONLY"))return (
          <main className="shell"><h1>Страница не найдена</h1>
            <RouteLink to="/courses">Перейти к курсам</RouteLink></main>);
        return <MainView route={path} showConsultationsFlowOptIn
          consultationsLoaders={consultationsLoaders}
          consultationsNow={consultationsNow}
          consultationsBookingMockTransport={consultationsBookingMockTransport}
        showVetHonoOptIn={showVetHonoOptIn}
        vetHonoReadTransport={vetHonoReadTransport}/>;
      }
      if(path&&(trainingRouteFromPath(path)||
        trainingReviewsTypeFromPath(path))){
        // WEB048-050 existing protected Hono GET, never a fixture-only route.
        return <MainView route={path} showTrainingFlowOptIn
          trainingReviewsLoader={trainingReviewsLoader}
          trainingDaysLoader={trainingDaysLoader} trainingDayLoader={trainingDayLoader}
          dailyTodayLoader={dailyTodayLoader} dailyDayLoader={dailyDayLoader}
        showConsultationsFlowOptIn={showConsultationsFlowOptIn}
        consultationsLoaders={consultationsLoaders}
        consultationsNow={consultationsNow}
        consultationsBookingMockTransport={consultationsBookingMockTransport}
        showVetHonoOptIn={showVetHonoOptIn}
        vetHonoReadTransport={vetHonoReadTransport}/>;
      }
      if(path&&dailyScheduleIdFromPath(path)){
        // Registered signed Hono daily GET pair, always read-only; no injected
        // fixture needed after actual Core false-create PG verification.
        return <MainView route={path} showTrainingFlowOptIn
          dailyTodayLoader={dailyTodayLoader ?? getTodayDailyCourse}
          // Preserve undefined for the NORMAL Hono consumer. MainView selects
          // the original read-only GET and enables paired-ID step actions.
          // Any injected fixture loader must remain read-only.
          dailyDayLoader={dailyDayLoader}/>;
      }
      if(path&&galleryAlbumIdFromPath(path)){
        // WEB032: direct album route via the same owner-bound read consumer.
        return <MainView route={path} showGalleryOptIn
          galleryAlbumLoader={galleryAlbumLoader}
          galleryDetailLoader={galleryDetailLoader}
          galleryPhotoLoader={galleryPhotoLoader}
        showTrainingFlowOptIn={showTrainingFlowOptIn}
        trainingReviewsLoader={trainingReviewsLoader}
        trainingDaysLoader={trainingDaysLoader}
        trainingDayLoader={trainingDayLoader}
        dailyTodayLoader={dailyTodayLoader}
        dailyDayLoader={dailyDayLoader}
        showConsultationsFlowOptIn={showConsultationsFlowOptIn}
        consultationsLoaders={consultationsLoaders}
        consultationsNow={consultationsNow}
        consultationsBookingMockTransport={consultationsBookingMockTransport}
        showVetHonoOptIn={showVetHonoOptIn}
        vetHonoReadTransport={vetHonoReadTransport}/>;
      }
      if (path?.startsWith("/pets/") || path?.startsWith("/articles/") ||
          path?.startsWith("/courses/") || path?.startsWith("/questions/") ||
          path?.startsWith("/moments/")) {
        return <MainView route={path} showExcusesOptIn={showExcusesOptIn}
        excusesSyntheticFixture={excusesSyntheticFixture}
        showAchievementsOptIn={showAchievementsOptIn}
        achievementsSyntheticTransport={achievementsSyntheticTransport}
        achievementsEntitlement={achievementsEntitlement}
        showGalleryOptIn={showGalleryOptIn}
        galleryAlbumLoader={galleryAlbumLoader}
        galleryDetailLoader={galleryDetailLoader}
        galleryPhotoLoader={galleryPhotoLoader}
        showTrainingFlowOptIn={showTrainingFlowOptIn}
        trainingReviewsLoader={trainingReviewsLoader}
        trainingDaysLoader={trainingDaysLoader}
        trainingDayLoader={trainingDayLoader}
        dailyTodayLoader={dailyTodayLoader}
        dailyDayLoader={dailyDayLoader}
        showConsultationsFlowOptIn={showConsultationsFlowOptIn}
        consultationsLoaders={consultationsLoaders}
        consultationsNow={consultationsNow}
        consultationsBookingMockTransport={consultationsBookingMockTransport}
        showVetHonoOptIn={showVetHonoOptIn}
        vetHonoReadTransport={vetHonoReadTransport}/>;
      }
      return (
        <main className="shell">
          <h1>Страница не найдена</h1>
          <RouteLink to="/courses">Перейти к курсам</RouteLink>
        </main>
      );
  }
}


/** App-lifetime session boundary. Keep its element mounted across changes
 * in whether a route requires the guard. Only enforce blocking for connected
 * routes. Conditional wrapper mounting replaced AppRouter and its owner tour
 * host on /profile -> /consultations, losing the in-progress original tour.
 * Persistence also avoids resetting the A->B->A/unknown-session fence across
 * ordinary navigation. Hono authorization remains independently mandatory.
 */
function ConnectedFlowSessionBoundary({children,enabled}:{children:ReactNode;enabled:boolean}){
  const cache=useQueryClient();
  // Preserve the App-lifetime boundary, but do not fetch private identity on
  // public recovery/confirmation pages where no actor session is required.
  const current=useCurrentUser(enabled);
  const snapshot=()=>cache.getQueryData<AuthUser|null>(
    CURRENT_USER_QUERY_KEY)??null;
  const first=useRef(snapshot());
  const last=useRef(first.current);
  const seen=useRef(!!first.current);
  const revoked=useRef(false);
  const revision=useRef(0);
  const id=(user:AuthUser|null)=>user&&JSON.stringify([
    user.id,user.username,user.role,
    (user as AuthUser&{sessionRevision?:unknown}).sessionRevision??null,
  ]);
  const version=useSyncExternalStore(callback=>
    cache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length!==CURRENT_USER_QUERY_KEY.length||
        !event.query.queryKey.every((part:unknown,i:number)=>
          part===CURRENT_USER_QUERY_KEY[i]))return;
      const next=snapshot();
      if(id(next)===id(last.current)&&event.type!=="removed")return;
      // Fresh guest -> first successful login may establish a baseline.
      // Auth mutations already clear unrelated old private cache.
      if(!seen.current&&!revoked.current&&next){
        first.current=next;seen.current=true;last.current=next;
        revision.current++;callback();return;
      }
      last.current=next;
      revoked.current=true;revision.current++;callback();
    }),()=>revision.current,()=>revision.current);
  const [loginRecovery,setLoginRecovery]=useState(0);
  const acceptedLogin=useRef(0);
  const receiptEpoch=useSyncExternalStore(callback=>
    cache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===EXPLICIT_LOGIN_QUERY_KEY.length&&
        event.query.queryKey.every((part:unknown,i:number)=>
          part===EXPLICIT_LOGIN_QUERY_KEY[i]))callback();
    }),()=>cache.getQueryData<ExplicitLoginReceipt>(
      EXPLICIT_LOGIN_QUERY_KEY)?.epoch??0);
  const explicitReceipt=cache.getQueryData<ExplicitLoginReceipt>(
    EXPLICIT_LOGIN_QUERY_KEY)??null;
  // Only an explicitly successful login can establish a NEW App-lifetime
  // baseline after a revoked session. useLogin already cleared the old
  // Query cache; never grant on /me, refresh or A->B->A alone.
  useEffect(()=>{
    if(!explicitReceipt||receiptEpoch===acceptedLogin.current||
      !current.isSuccess||!current.data||
      id(explicitReceipt)!==id(current.data))return;
    const hasPrivate=cache.getQueryCache().findAll({
      predicate:q=>q.queryKey[0]!=="auth",
    }).length>0;
    if(hasPrivate)return;
    acceptedLogin.current=receiptEpoch;
    first.current=current.data;
    last.current=current.data;
    seen.current=true;
    revoked.current=false;
    revision.current++;
    setLoginRecovery(x=>x+1);
  },[cache,current.data,current.isSuccess,explicitReceipt,
    receiptEpoch,loginRecovery]);
  const pendingLogout=useIsMutating({mutationKey:["auth","logout"]})>0;
  const logoutErrors=useMutationState({filters:{
    mutationKey:["auth","logout"],status:"error",
  },select:mutation=>mutation.state.submittedAt});
  // Login success purges the previous MutationCache. Any remaining logout
  // error is therefore newer than the latest accepted login and ambiguous.
  const recentLogoutError=logoutErrors.length>0;
  const authPresent=!!current.data?.id;
  // During /auth/me revalidation keep all private connected screens hidden,
  // including a stale cached A while the 401->refresh->/me chain is pending.
  const blocked=revoked.current||pendingLogout||recentLogoutError||
    current.isFetching||current.isError||
    (authPresent&&(!first.current||id(first.current)!==id(current.data??null)||
      id(snapshot())!==id(current.data??null)));
  useEffect(()=>{
    if(!revoked.current)return;
    const privateQuery=(query:{queryKey:readonly unknown[]})=>
      query.queryKey[0]!=="auth";
    void cache.cancelQueries({predicate:privateQuery}).then(()=>
      cache.removeQueries({predicate:privateQuery}));
  },[cache,version]);
  if(!enabled||!blocked)return <>{children}</>;
  return <main className="shell" aria-label="Защита сессии связанных разделов">
    <AuthPanel/>
    <section role="alert">
      <p>{current.isFetching?"Проверяем сессию. Личные данные временно скрыты.":
        "Сессия изменилась или её состояние неизвестно. Личные данные скрыты."}</p>
      <p>Для нового просмотра личных разделов откройте приложение заново.</p>
    </section>
    <RouteLink to="/login">Войти</RouteLink>
  </main>;
}

/** Browser-tab orientation for established READ routes only. Never use
 * URL identifiers, usernames, query tokens or server/private content as titles.
 * Opt-in and write/closed routes deliberately retain the neutral base title. */
const BASE_DOCUMENT_TITLE = "Гафус";
const READ_TITLE_SUFFIX = " — Гафус";

function readPageTitle(path: RoutePath | null, search: string): string {
  if (path === null) return "Страница не найдена" + READ_TITLE_SUFFIX;
  if (path === "/" || path === "/courses") return "Курсы" + READ_TITLE_SUFFIX;
  if (path === "/articles") return "Статьи" + READ_TITLE_SUFFIX;
  if (path === "/subscription") return "Подписка" + READ_TITLE_SUFFIX;
  if (path === "/questions") return "Вопросы" + READ_TITLE_SUFFIX;
  if (path === "/moments") return "Моменты" + READ_TITLE_SUFFIX;
  if(consultationRouteFromPath(path)||consultationCallIdFromPath(path))return "Консультации с кинологом"+READ_TITLE_SUFFIX;
  if (path === "/profile") {
    // Presence is only used to select a generic label; the value is never
    // included. Unrelated changes to ?cursor/#anchor produce no title write.
    return (new URLSearchParams(search).has("username")
      ? "Публичный профиль" : "Профиль") + READ_TITLE_SUFFIX;
  }
  if (courseIdFromPath(path)) return "Курс" + READ_TITLE_SUFFIX;
  if (articleSlugFromPath(path)) return "Статья" + READ_TITLE_SUFFIX;
  if (questionIdFromPath(path)) return "Вопрос" + READ_TITLE_SUFFIX;
  if (momentIdFromPath(path)) return "Момент" + READ_TITLE_SUFFIX;
  return BASE_DOCUMENT_TITLE;
}

/** Match the original Next middleware: an unauthenticated browser may only
 * visit the landing/auth/recovery pages. Do not fetch private catalog, previews
 * or another user's cached views before /auth/me resolves. An ambiguous auth
 * failure (5xx) is not proof of logout and must not redirect automatically. */
const NEXT_PUBLIC_WEB_ROUTES = new Set<RoutePath>([
  "/", "/login", "/register", "/vk-consent", "/passwordReset", "/reset-password",
  "/profile/confirm-email", "/otmazki",
]);
/** Public recovery/confirmation pages must not make an unnecessary /auth/me
 * request or require an existing login. Keep the auth hook mounted only for
 * protected routes, in a stable child component with unconditional hooks. */
function NextGuestRouteBoundary({route,children}:{
  route:RoutePath|null;children:ReactNode;
}) {
  if(route&&NEXT_PUBLIC_WEB_ROUTES.has(route))return <>{children}</>;
  return <NextProtectedRouteBoundary>{children}</NextProtectedRouteBoundary>;
}
function NextProtectedRouteBoundary({children}:{children:ReactNode}) {
  const current=useCurrentUser();
  const guest=current.isSuccess&&!current.isFetching&&current.data===null;
  useEffect(()=>{
    if(!guest||window.location.pathname==="/")return;
    // Replace protected URL; native Back must not re-enter an auth loop.
    window.history.replaceState(null,"","/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  },[guest]);
  if(guest)return null;
  if(!current.isSuccess||current.isFetching||!current.data){
    return <main className="shell" role="status">
      {current.isError ? "Не удалось проверить авторизацию." : "Проверяем сессию…"}
    </main>;
  }
  return <>{children}</>;
}

/** Existing App and routes: the outer fence is present ONLY while explicit
 * source/mock connected flows are injected. Default production route
 * dispatch, login and all other source features stay unchanged. */
export function App(props:Parameters<typeof AppRouter>[0]={}){
  const authCache=useQueryClient();
  // View-only identity persists across catalog/detail/login. Even A->B->A
  // increments its generation: an old history entry must not restore drafts.
  const catalogInstance=useRef<string|null>(null);
  if(catalogInstance.current===null) catalogInstance.current=
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const actorId=()=>authCache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null;
  const actorTrack=useRef({actor:actorId(),epoch:0});
  const catalogEpoch=useSyncExternalStore(callback=>
    authCache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length!==CURRENT_USER_QUERY_KEY.length||
        !event.query.queryKey.every((part:unknown,i:number)=>
          part===CURRENT_USER_QUERY_KEY[i]))return;
      const next=actorId();
      if(next===actorTrack.current.actor)return;
      actorTrack.current={actor:next,epoch:actorTrack.current.epoch+1};
      callback();
    }),()=>actorTrack.current.epoch,()=>0);
  const catalogGeneration=`${catalogInstance.current}:${catalogEpoch}`;
  const currentPath=useRoutePath();
  const routeSearch=useRouteSearch();
  const title=readPageTitle(currentPath,routeSearch);
  // Keep the pre-mount document title to restore when this App unmounts.
  // This lifetime effect is separate from route updates, so same-title
  // query/hash changes never trigger a redundant document.title write.
  useEffect(()=>{
    const originalTitle=document.title;
    return ()=>{if(document.title!==originalTitle)document.title=originalTitle;};
  },[]);
  useEffect(()=>{
    if(document.title!==title)document.title=title;
  },[title]);
  // A History API transition replaces the page content without the browser's
  // normal document-navigation focus move. Focus the new main landmark after
  // React commits it, but leave first load/deep-link focus to the browser.
  const previousLocation=useRef<string|null>(null);
  useLayoutEffect(()=>{
    const locationKey=(currentPath??"not-found")+routeSearch;
    if(previousLocation.current===null){
      previousLocation.current=locationKey;
      return;
    }
    if(previousLocation.current===locationKey)return;
    previousLocation.current=locationKey;
    const main=document.querySelector<HTMLElement>("main.shell");
    if(!main)return;
    if(!main.hasAttribute("tabindex"))main.setAttribute("tabindex","-1");
    main.focus({preventScroll:true});
  },[currentPath,routeSearch]);
  // Preserve the existing App-lifetime private-session fence on owner gallery
  // direct URLs, even without injected feature-test transports.
  const galleryOwnerRoute=currentPath!==null&&
    (currentPath==="/profile/albums"||galleryAlbumIdFromPath(currentPath)!==null);
  const notificationOwnerRoute=currentPath==="/feed/notifications";
  const reminderOwnerRoute=currentPath==="/reminders";
  const chatOwnerRoute=currentPath==="/chats" || /^\/chats\/[A-Za-z0-9_-]{1,128}$/.test(currentPath??"") ||
    currentPath==="/cynologist-chat" ||
    chatDialogIdFromPath(currentPath ?? "")!==null;
  const hiddenAuthorsOwnerRoute=currentPath==="/feed/hidden-authors";
  const trainingOwnerRoute=currentPath!==null&&
    (trainingRouteFromPath(currentPath)!==null||
      trainingReviewsTypeFromPath(currentPath)!==null);
  const consultationOwnerRoute=currentPath!==null&&
    (consultationRouteFromPath(currentPath)!==null||consultationCallIdFromPath(currentPath)!==null);
  const galleryConnectedPrivate=props.showGalleryOptIn===true&&currentPath!==null&&
    !NEXT_PUBLIC_WEB_ROUTES.has(currentPath);
  const connected=reminderOwnerRoute||chatOwnerRoute||trainingOwnerRoute||consultationOwnerRoute||
    hiddenAuthorsOwnerRoute||notificationOwnerRoute||
    galleryOwnerRoute||galleryConnectedPrivate||
    props.showTrainingFlowOptIn===true||
    props.showConsultationsFlowOptIn===true||
    props.showVetHonoOptIn===true||
    props.showNotificationsRouteOptIn===true||
    props.showWalletRouteOptIn===true||
    props.showGuidesRouteOptIn===true||
    props.showPartnerRouteOptIn===true;
  return <CourseViewSessionContext.Provider value={catalogGeneration}>
    {/* Keep the principal boundary mounted even when the route changes to
        public login/recovery. Otherwise A→B→A can reset the revocation fence
        and reveal previously cached A-owned content after returning. */}
    <ConnectedFlowSessionBoundary enabled={connected}>
      <NextGuestRouteBoundary route={currentPath}>
        <DeferredReadRoute loading="Загружаем страницу…"><AppRouter {...props}/></DeferredReadRoute>
      </NextGuestRouteBoundary>
    </ConnectedFlowSessionBoundary>
  </CourseViewSessionContext.Provider>;
}
