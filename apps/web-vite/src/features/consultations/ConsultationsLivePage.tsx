import { Loading } from "../../shared/ui";
import { BackButtonLink, CaramelButtonLink, PrimaryButtonLink, PrimaryButton, SecondaryButton } from "../../shared/ui";
import {lazy,Suspense,useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {useInfiniteQuery,useQuery,useQueryClient} from "@tanstack/react-query";
import {ApiError} from "../../shared/api/client";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {RouteLink,navigate,consultationLegacySlotsPath,type ConsultationRouteView} from "../../shared/router/location";
import {consultationRange,getSpecialists,getSpecialistSlots,getSpecialistCalendarSlots,getMyConsultations,mskLabel,type Slot,type Specialist} from "./consultationReadApi";
import {ConsultationSlotsCalendar} from "./ConsultationSlotsCalendar";
import {SubscriptionCheckout} from "../commerce/SubscriptionCheckout";
import {verifyBookingSlot,createConsultationBooking,recoverConsultationBooking,cancelConsultationBooking,prepareConsultationCall,admitConsultationCall,signConsultationCall,consultationError,canCancelBooking,type BookingIntake} from "./consultationLiveApi";
import {isBookingIntakeValid} from "@gafus/consultation-shared";
import {isLikelyValidRuPhoneInput} from "@gafus/consultation-shared";
import {formatConsultationListDateTimeMsk,getConsultationBookingStatusPresentation} from "@gafus/consultation-shared";
import "./consultations-live.css";
import page from "../../brand/LegacyConsultationsPage.module.css";
import subnav from "../../brand/LegacyConsultationsSubNav.module.css";
import cards from "../../brand/LegacyConsultationCards.module.css";
import mineStyles from "../../brand/LegacyMyConsultations.module.css";

const VoxRoom=lazy(()=>import("@gafus/ui-components/voximplant-room").then(m=>({default:m.VoxConsultationRoom})));
const safeId=/^[A-Za-z0-9_-]{1,128}$/;
// Presentation-only curator badge copied from the preserved Next catalog.
// Never use a public-facing badge to authorize privileged trainer actions.
const LANA_CYNOLOGIST_USER_ID="cmhq7qk2s0000nn01jr2ptnil";
function Unavailable({message,retry}:{message:string;retry?:()=>void}){
  return <div role="alert" className="consult-live-notice"><p>{message}</p>
    {retry&&<button type="button" className="consult-live-secondary" onClick={retry}>Повторить</button>}
  </div>;
}
function ConsultNav({mine=false,none=false}:{mine?:boolean;none?:boolean}){return <nav
  className={`${subnav.subNav} consult-live-nav`} aria-label="Раздел консультаций">
  <RouteLink to="/consultations" className={mine||none?subnav.subNavLink:subnav.subNavLinkActive}
    current={!mine&&!none}>Каталог кинологов</RouteLink>
  <RouteLink to="/consultations/my" className={mine?subnav.subNavLinkActive:subnav.subNavLink}
    current={mine}>Мои консультации</RouteLink>
</nav>;}
/** Public listed-trainer art; if CDN returns an error, retain the original
 * Next rounded initials placeholder instead of a broken image icon.
 */
function SpecialistAvatar({specialist}:{specialist:Specialist}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[specialist.avatarUrl]);
  return <div className={cards.avatarFrame}>
    {specialist.avatarUrl&&!failed ? <img src={specialist.avatarUrl}
      alt={`Фото: ${specialist.name}`} className={cards.avatar}
      width={70} height={70} loading="lazy" onError={()=>setFailed(true)}/> :
      <span className={cards.avatarPlaceholder} aria-hidden="true">
        {specialist.name.trim().split(/\s+/).slice(0,2)
          .map(part=>part[0]??"").join("").toUpperCase()}
      </span>}
  </div>;
}
function Catalog({ownerId}:{ownerId:string}){
  const q=useQuery({queryKey:["consult-live","catalog",ownerId],queryFn:getSpecialists,retry:false});
  if(q.isPending)return <Loading message="Загружаем кинологов…" />;
  if(q.isError)return <Unavailable message={consultationError(q.error)}
    retry={()=>void q.refetch()}/>;
  return <>
    {!q.data.eligibility.canBook&&<p role="status" className="consult-live-notice">Новая запись пока недоступна. <RouteLink to="/consultations/my">Мои консультации</RouteLink></p>}
    <section className={`${cards.catalog} next-cynologist-catalog`}
      aria-labelledby="consultations-catalog-title">
      <div className={cards.catalogHeading}>
        <h2 className={cards.catalogTitle} id="consultations-catalog-title">Доступные специалисты</h2>
        <p className={cards.catalogCaption}>Выберите того, с кем хотите обсудить питомца</p>
      </div>
      {!q.data.items.length?<div className={cards.emptyState}>
        <p>Пока нет доступных кинологов для записи. Загляните позже.</p></div>:
        <ul className={`${cards.list} ${q.data.items.length===1?cards.listSingle:""}`}>
          {q.data.items.map(s=><li key={s.id} className={cards.card}>
            <div className={cards.cardInner}>
              <SpecialistAvatar specialist={s}/>
              <div className={cards.cardBody}>
                <h3 className={cards.name}>{s.name}</h3>
                {s.userId===LANA_CYNOLOGIST_USER_ID&&<div className={cards.badges}>
                  <span className={cards.badge}>Составитель курсов</span>
                  <span className={cards.badge}>Главный кинолог проекта</span>
                </div>}
              </div>
            </div>
            <div className={cards.meta}>
              <span>Консультация · {s.slotDurationMin} мин</span><span>МСК (UTC+3)</span>
            </div>
            <div className={cards.actions}>
              <CaramelButtonLink href={`/profile?username=${encodeURIComponent(s.username)}`}
                className={cards.action}
                aria-label={`Подробнее о кинологе ${s.name}`}>
                Подробнее о кинологе
              </CaramelButtonLink>
              <PrimaryButtonLink href={consultationLegacySlotsPath(s.userId)}
                className={cards.action}
                aria-label={`Выбрать время у кинолога ${s.name}`}>
                Выбрать время <span aria-hidden="true">→</span>
              </PrimaryButtonLink>
            </div>
          </li>)}</ul>}
    </section>
  </>;
}
function BookingForm({slot,specialist,ownerId}:{slot:Slot;specialist:Specialist;ownerId:string}){
  const client=useQueryClient();
  const [form,setForm]=useState({clientOwnerName:"",clientPhone:"",petName:"",petGender:"" as ""|"MALE"|"FEMALE",petAge:"",petBreed:"",clientProblem:"",clientSelfHelpAttempt:""});
  const [error,setError]=useState<string|null>(null);
  const [phase,setPhase]=useState<"ready"|"verifying"|"sending"|"unknown"|"recovering"|"rejected"|"done">("ready");
  const key=useRef(globalThis.crypto?.randomUUID?.()??null);
  const inFlight=useRef(false);
  const sessionValid=useRef(true);
  const everRevoked=useRef(false);
  const initialPrincipal=useRef(client.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY));
  const matchesOriginal=useCallback(()=>{
    const now=client.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY);
    const first=initialPrincipal.current;
    const revision=(u:AuthUser|null|undefined)=>
      (u as AuthUser&{sessionRevision?:unknown}|undefined)?.sessionRevision;
    return !!now?.id && now.id===ownerId && now.id===first?.id &&
      now.username===first.username && now.role===first.role &&
      revision(now)===revision(first);
  },[client,ownerId]);
  useEffect(()=>{
    // React.StrictMode dev effect replay runs setup → cleanup → setup without
    // losing the same mounted draft. Restore ONLY if no real auth revocation
    // ever happened and the exact initial actor/session still matches. A→B→A
    // and logout/removal remain irreversibly retired for this component.
    sessionValid.current=!everRevoked.current&&matchesOriginal();
    const unsub=client.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length!==CURRENT_USER_QUERY_KEY.length||
        !event.query.queryKey.every((v:unknown,i:number)=>v===CURRENT_USER_QUERY_KEY[i]))return;
      if(event.type==="removed"||!matchesOriginal()){
        everRevoked.current=true;
        sessionValid.current=false;
      }
    });
    return ()=>{sessionValid.current=false;unsub();};
  },[client,matchesOriginal]);
  const ownerCurrent=()=>sessionValid.current&&
    client.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===ownerId;
  const ready=isBookingIntakeValid({...form,phoneOk:isLikelyValidRuPhoneInput});
  const update=(name:keyof typeof form,value:string)=>setForm(p=>({...p,[name]:value}));
  async function book(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(inFlight.current||phase!=="ready"||!ready||!key.current)return;
    if(!ownerCurrent()){
      // The old branch silently dropped native submits, leaving an enabled
      // booking button and no explanation. Never POST with a retired actor.
      setError("Сессия изменилась. Откройте запись заново, не повторяя заявку.");
      setPhase("rejected");
      return;
    }
    inFlight.current=true;setError(null);setPhase("verifying");
    try{await verifyBookingSlot(specialist.userId,slot.id);
      if(!ownerCurrent())throw Error("CHANGED_CONSULTATION_SESSION");
    }catch(e){if(ownerCurrent()){setError(consultationError(e));setPhase("ready");}inFlight.current=false;return;}
    setPhase("sending");
    try{
      const d=await createConsultationBooking({...form,petGender:form.petGender as BookingIntake["petGender"],slotId:slot.id,idempotencyKey:key.current});
      if(!safeId.test(d?.booking?.id)||!["created","idempotent_replay"].includes(d.kind))throw Error("UNKNOWN_BOOKING_ACK");
      setPhase("done");if(ownerCurrent())navigate("/consultations/my");
    }catch(e){if(ownerCurrent()){
      if(e instanceof ApiError&&[400,402,403,404,409,429].includes(e.status)){
        setError(consultationError(e));setPhase("rejected");
      }else{setError("Результат записи неизвестен. Не отправляйте заявку повторно, чтобы не создать дубль.");setPhase("unknown");}
    }}finally{inFlight.current=false;}
  }
  async function recover(){
    if(inFlight.current||!key.current||!ownerCurrent())return;
    inFlight.current=true;setPhase("recovering");
    try{const d=await recoverConsultationBooking(key.current);
      if(!ownerCurrent())return;
      if(d.state==="FOUND"&&d.booking&&safeId.test(d.booking.id)){
        setPhase("done");navigate("/consultations/my");
      }else{setPhase("unknown");setError("Запись пока не подтверждена. Проверьте «Мои консультации» или обратитесь в поддержку. Не отправляйте повторно.");}
    }catch{if(ownerCurrent()){setPhase("unknown");setError("Проверка недоступна. Не отправляйте бронь повторно.");}}
    finally{inFlight.current=false;}
  }
  const input=(name:keyof typeof form,label:string,max=150)=><label>{label}
    <input name={name} value={form[name]} maxLength={max}
    onChange={e=>update(name,e.target.value)} required disabled={phase!=="ready"}/></label>;
  return <section className="consult-live-form" aria-label="Подтверждение записи">
    <BackButtonLink to={consultationLegacySlotsPath(specialist.userId)}>Назад к расписанию</BackButtonLink>
    <h2>Подтверждение консультации</h2>
    <p>{specialist.name} · <time dateTime={slot.startAtUtc}>{mskLabel(slot.startAtUtc)}</time></p>
    <form onSubmit={e=>void book(e)}>
      {input("clientOwnerName","Как вас зовут",15)}
      {input("clientPhone","Телефон для связи",32)}
      {input("petName","Кличка питомца",15)}
      <label>Пол питомца<select value={form.petGender} disabled={phase!=="ready"} required
        onChange={e=>update("petGender",e.target.value)}>
        <option value="">Выберите пол</option><option value="MALE">Мальчик</option><option value="FEMALE">Девочка</option>
      </select></label>
      {input("petAge","Возраст питомца",100)}
      {input("petBreed","Порода питомца",100)}
      <label>С какой проблемой хотите обратиться?
        <textarea value={form.clientProblem} maxLength={1000} minLength={10} required
          disabled={phase!=="ready"} onChange={e=>update("clientProblem",e.target.value)}/></label>
      <label>Что уже пробовали сделать?
        <textarea value={form.clientSelfHelpAttempt} maxLength={1000} required
          disabled={phase!=="ready"} onChange={e=>update("clientSelfHelpAttempt",e.target.value)}/></label>
      {error&&<p role="alert" className="consult-live-error">{error}</p>}
      {phase==="ready"&&<PrimaryButton type="submit" disabled={!ready||!key.current}>Записаться на консультацию</PrimaryButton>}
      {(phase==="sending"||phase==="verifying")&&<Loading message="Проверяем доступность и оформляем запись…" />}
      {phase==="rejected"&&<p role="status">Бронирование не создано. Выберите другое время или проверьте условия доступа.</p>}
      {phase==="unknown"&&<PrimaryButton type="button" onClick={()=>void recover()}>Проверить результат записи</PrimaryButton>}
      {phase==="recovering"&&<Loading message="Проверяем результат…" />}
      {phase==="done"&&<RouteLink to="/consultations/my">Посмотреть мои консультации</RouteLink>}
    </form>
  </section>;
}
function moscowDay(iso:string){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Moscow",
    year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso));
  const get=(k:string)=>parts.find(p=>p.type===k)?.value??"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function SpecialistDetail({ownerId,view}:{ownerId:string;view:ConsultationRouteView}){
  const catalog=useQuery({queryKey:["consult-live","catalog",ownerId],queryFn:getSpecialists,retry:false});
  const range=useRef(consultationRange());
  const specialist=catalog.data?.items.find(x=>x.userId===view.trainerId);
  const slots=useQuery({queryKey:["consult-live","slots",view.kind,ownerId,view.trainerId,range.current.from,range.current.to],
    queryFn:()=>view.kind==="slots"?getSpecialistCalendarSlots(view.trainerId!,range.current):
      getSpecialistSlots(view.trainerId!,range.current),
    enabled:!!specialist&&view.kind!=="trainer",retry:false,
    refetchInterval:view.kind==="slots"?60_000:false});
  if(catalog.isPending)return <Loading message="Проверяем специалиста…" />;
  if(catalog.isError)return <Unavailable message={consultationError(catalog.error)}
    retry={()=>void catalog.refetch()}/>;
  if(!specialist)return <Unavailable message="Кинолог не найден в опубликованном каталоге."/>;
  if(view.kind==="trainer")return <section className="consult-live-profile-detail">
    <h2>{specialist.name}</h2><p>{specialist.about||"Кинолог проекта Гафус"}</p>
    <p>Продолжительность консультации: {specialist.slotDurationMin} мин.</p>
    <RouteLink to={consultationLegacySlotsPath(specialist.userId)}>
      Посмотреть свободное время
    </RouteLink>
  </section>;
  if(slots.isPending)return <Loading message="Загружаем свободное время…" />;
  if(slots.isError){
    if(slots.error instanceof ApiError && slots.error.status===402){
      return <div className="consult-live-booking-paywall">
        <SubscriptionCheckout ownerId={ownerId} embedded context="consultation"
          returnPath={consultationLegacySlotsPath(view.trainerId!)}
          search={window.location.search}/>
        <RouteLink to="/consultations" className="consult-paywall-back">Вернуться к каталогу кинологов</RouteLink>
      </div>;
    }
    return <Unavailable message={consultationError(slots.error)} retry={()=>void slots.refetch()}/>;
  }
  if(view.kind==="booking"){
    const chosen=slots.data.items.find(x=>x.id===view.slotId);
    if(!chosen)return <Unavailable message="Слот больше недоступен. Выберите другое время."/>;
    if(!slots.data.eligibility.canBook)return <Unavailable message="Новая запись сейчас недоступна. Откройте «Мои консультации»."/>;
    return <BookingForm key={chosen.id} ownerId={ownerId} specialist={specialist} slot={chosen}/>;
  }
  const calendar=slots.data;
  return <section className="consult-live-original-slots next-consultation-slots">
    <p className="consult-live-back"><BackButtonLink to="/consultations">Все кинологи</BackButtonLink></p>
    <h1 className="consult-live-slot-trainer-name">{specialist.name}</h1>
    <ConsultationSlotsCalendar specialist={specialist} ownerId={ownerId} range={range.current}
      calendar={{items:calendar.items,eligibility:calendar.eligibility,
        dayOffDates:"dayOffDates" in calendar&&Array.isArray(calendar.dayOffDates)?calendar.dayOffDates:[]}}
      refresh={()=>void slots.refetch()}/>
  </section>;
}

function MyConsultations({userId,username}:{userId:string;username:string}){
  const client=useQueryClient();
  const [actionId,setActionId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [unconfirmedCancellation,setUnconfirmedCancellation]=useState<string|null>(null);
  const cancelLock=useRef(false);
  const q=useInfiniteQuery({queryKey:["consult-live","mine",userId,username],
    queryFn:({pageParam})=>getMyConsultations(username,pageParam),
    initialPageParam:null as string|null,
    getNextPageParam:page=>page.nextCursor??undefined,retry:false});
  const ownerCurrent=()=>client.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId;
  // Reconcile an ambiguous POST with an owner-only GET, never with a second POST.
  async function checkCancelled(id:string){
    if(!ownerCurrent())return false;
    try{
      const result=await q.refetch();
      if(!ownerCurrent()||!result.isSuccess)return false;
      return result.data.pages.flatMap(page=>page.items)
        .some(booking=>booking.id===id&&booking.status==="CANCELLED_BY_USER");
    }catch{return false;}
  }
  async function cancel(id:string){
    if(cancelLock.current||unconfirmedCancellation||!ownerCurrent())return;
    cancelLock.current=true;setActionId(id);setError(null);
    try{
      const ack=await cancelConsultationBooking(id);
      if(!ownerCurrent())return;
      if(ack?.bookingId!==id)throw Error("UNKNOWN_CANCELLATION_ACK");
      if(!(await checkCancelled(id))&&ownerCurrent()){
        setUnconfirmedCancellation(id);
        setError("Отмена отправлена, но сервер ещё не подтвердил статус. Проверьте запись.");
      }
    }catch(e){
      if(!ownerCurrent())return;
      if(e instanceof ApiError&&[400,401,402,403,404,409,429].includes(e.status)){
        setError(consultationError(e));
      }else if(!(await checkCancelled(id))&&ownerCurrent()){
        setUnconfirmedCancellation(id);
        setError("Статус отмены неизвестен. Повторная отмена не отправлена. Проверьте запись.");
      }
    }finally{
      cancelLock.current=false;
      if(ownerCurrent())setActionId(null);
    }
  }
  async function checkUnconfirmedCancellation(){
    if(cancelLock.current||!unconfirmedCancellation||!ownerCurrent())return;
    cancelLock.current=true;setActionId(unconfirmedCancellation);
    const confirmed=await checkCancelled(unconfirmedCancellation);
    if(ownerCurrent()){
      if(confirmed){setUnconfirmedCancellation(null);setError(null);}
      else setError("Отмена пока не подтверждена. Повторная отмена не отправлена.");
      setActionId(null);
    }
    cancelLock.current=false;
  }
  if(q.isPending)return <Loading message="Загружаем ваши консультации…" />;
  if(q.isError)return <Unavailable message={consultationError(q.error)}
    retry={()=>void q.refetch()}/>;
  const items=q.data.pages.flatMap(page=>page.items);
  return <section className={`${mineStyles.wrap} next-my-consultations`}>
    <p className={mineStyles.hint}>Все консультации отображаются по времени МСК (UTC+3).</p>
    {error&&<p role="alert" className="consult-live-error">{error}</p>}
    {unconfirmedCancellation&&<button type="button" className="consult-live-secondary"
      disabled={actionId!==null} onClick={()=>void checkUnconfirmedCancellation()}>
      Проверить статус отмены
    </button>}
    {!items.length?<p className={mineStyles.empty}>
      Пока нет записей. Выберите кинолога в каталоге и забронируйте удобное время.
    </p>:
      <ul className={mineStyles.list}>
        {items.map(b=>{
          const pres=getConsultationBookingStatusPresentation(b.status,{
            cancelReason:b.cancelReason,
          });
          const intake=[b.clientOwnerName?.trim(),b.petName?.trim()]
            .filter(Boolean).join(" · ");
          return <li key={b.id} className={mineStyles.card}>
            <div className={mineStyles.statusRow}>
              <span className={mineStyles.badge} data-tone={pres.tone}>{pres.badge}</span>
            </div>
            <p className={mineStyles.description}>{pres.description}</p>
            {pres.cancelReason&&<p className={mineStyles.cancelReason}>
              <span className={mineStyles.cancelReasonLabel}>Комментарий кинолога: </span>
              {pres.cancelReason}
            </p>}
            <p className={mineStyles.titleLine}>
              {b.cynologistName??"Кинолог"} —{" "}
              <time dateTime={b.slot.startAtUtc}>
                {formatConsultationListDateTimeMsk(b.slot.startAtUtc)}
              </time>
            </p>
            {intake&&<p className={mineStyles.intakeShort}>{intake}</p>}
            {b.status==="CONFIRMED"&&<p className={mineStyles.joinLink}>
              <RouteLink to={`/consultations/call/${b.id}`}>Перейти к видеовстрече</RouteLink>
            </p>}
            {canCancelBooking(b.status)&&<SecondaryButton variant="red" type="button" className={mineStyles.cancelBtn}
              disabled={actionId!==null||unconfirmedCancellation!==null}
              onClick={()=>void cancel(b.id)}>
              {actionId===b.id?"Отменяем…":"Отменить запись"}
            </SecondaryButton>}
          </li>;
        })}</ul>}
    {q.hasNextPage&&<button type="button" className="consult-live-secondary" disabled={q.isFetchingNextPage} onClick={()=>void q.fetchNextPage()}>{q.isFetchingNextPage?"Загружаем…":"Показать ещё"}</button>}
  </section>;
}
export function ConsultationCallLive({bookingId}:{bookingId:string}){
  return <Suspense fallback={<Loading message="Загружаем видеозвонок…" />}>
    <VoxRoom bookingId={bookingId} backHref="/consultations/my" prepare={prepareConsultationCall} signKey={signConsultationCall} authorizeJoin={admitConsultationCall}/>
  </Suspense>;
}
export function ConsultationsLivePage({userId,username,view,bookingId}:{
  userId:string;username:string;view:ConsultationRouteView|null;bookingId?:string|null;
}){
  const mine=view?.kind==="mine";
  const catalogScreen=view?.kind==="list"&&!bookingId;
  const slotsScreen=view?.kind==="slots";
  return <div className={`${page.page} consult-live-page next-consultations-page ${slotsScreen?"consult-live-slots-screen":""} ${catalogScreen?"consult-live-catalog-screen":""}`}
    data-consultation-live="true" data-next-consultations>
    {!slotsScreen&&<h1 className={page.pageTitle}>{bookingId?"Видеоконсультация":mine?
      "Мои консультации":"Консультации с кинологом"}</h1>}
    <div className={page.content}>
      <ConsultNav mine={mine} none={slotsScreen}/>
      {bookingId?<ConsultationCallLive bookingId={bookingId}/>:
        mine?<MyConsultations userId={userId} username={username}/>:
        view?.kind==="list"?<Catalog ownerId={userId}/>:
        view?<SpecialistDetail ownerId={userId} view={view}/>:null}
    </div>
  </div>;
}
