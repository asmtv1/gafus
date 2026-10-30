import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import {useState} from "react";
import {useInfiniteQuery,useQuery} from "@tanstack/react-query";
import {ApiError} from "../../shared/api/client";
import {RouteLink,navigate,consultationPath,consultationLegacySlotsPath,
  type ConsultationRouteView} from "../../shared/router/location";
import {ConsultationBookingMockForm} from "./ConsultationBookingMockForm";
import {ConsultationPublicTrainerProfile}
  from "./ConsultationPublicTrainerProfile";
import type {BookingSourceMockTransport} from "./bookingSourceMock";
import {
  consultationRange,getMyConsultations,getSpecialistSlots,getSpecialists,mskLabel,
  type BookingsPage,type Catalog,type Eligibility,type SlotRange,
  type SlotsView,type Specialist,type Slot,type Booking,
} from "./consultationReadApi";

export type ConsultationsReadLoaders={
  specialists?:()=>Promise<Catalog>;
  slots?:(id:string,range:SlotRange)=>Promise<SlotsView>;
  mine?:(username:string,cursor:string|null)=>Promise<BookingsPage>;
};
const statusCopy:Record<Booking["status"],string>={
  PENDING_TRAINER_CONFIRMATION:"Ожидает подтверждения кинолога",
  CONFIRMED:"Подтверждена",
  CANCELLED_BY_TRAINER:"Отменена кинологом",
  CANCELLED_BY_USER:"Отменена вами",
  CANCELLED_BY_SLA:"Отменена по сроку подтверждения",
  CANCELLED_BY_SYSTEM:"Отменена системой",
  COMPLETED:"Завершена",
  NO_SHOW:"Не состоялась",
};
function errorText(error:unknown,scope:"slots"|"catalog"|"mine"){
  if(error instanceof ApiError){
    if(error.status===401)return "Сессия завершена. Войдите снова.";
    if(error.status===403)return "Доступ к консультациям ограничен.";
    if(error.status===402)return "Для просмотра свободных слотов нужна активная подписка.";
    if(error.status===404)return "Выбранный специалист недоступен.";
  }
  return scope==="slots"?"Не удалось загрузить свободное время.":
    scope==="mine"?"Не удалось загрузить мои консультации.":
      "Не удалось загрузить список специалистов.";
}
function EligibilityNotice({value}:{value:Eligibility}){
  if(value.canBook)return <p className="note" role="status">
    Вы можете выбрать свободное время. Запись на консультацию пока не подключена.
  </p>;
  // Never echo raw backend messages into a public specialist list:
  // eligibility text may be private/session-bound or unexpectedly verbose.
  const bounded=value.reason==="ACTIVE_BOOKING"?"Уже есть активная бронь.":
    value.reason==="WEEKLY_COOLDOWN"?
      "Новая запись станет доступна после периода ожидания.":
      "Возможность новой записи временно ограничена.";
  return <p className="consultation-eligibility" role="status">{bounded}</p>;
}
function SlotCalendar({userId,username,specialist,range,loader,onBack,
  mockTransport,attempted,onAttempt,onMyBookings,isSessionCurrent,
  routeMode=false,routeSlotId=null,
}:{
  userId:string;username:string;specialist:Specialist;range:SlotRange;
  loader:(id:string,range:SlotRange)=>Promise<SlotsView>;onBack:()=>void;
  mockTransport?:BookingSourceMockTransport;attempted:Set<string>;
  onAttempt:(slotId:string)=>void;onMyBookings:()=>void;
  isSessionCurrent:()=>boolean;
  routeMode?:boolean;routeSlotId?:string|null;
}){
  const [selectedSlot,setSelectedSlot]=useState<Slot|null>(null);
  // Keep active response visible; block only subsequent re-entry.
  const [activeAttempt,setActiveAttempt]=useState(false);
  const exitForm=()=>{setSelectedSlot(null);setActiveAttempt(false);
    if(routeMode)navigate(consultationLegacySlotsPath(specialist.userId));
  };
  const query=useQuery({
    queryKey:["consultations","slots",userId,specialist.userId,range.from,range.to],
    queryFn:()=>loader(specialist.userId,range),
    retry:false,staleTime:0,gcTime:0,
  });
  const visibleSlot=routeMode&&routeSlotId?
    query.data?.items.find(item=>item.id===routeSlotId)??null:selectedSlot;
  if(routeMode&&routeSlotId&&query.isSuccess&&!visibleSlot)
    return <section role="alert" className="empty-state">
      <p>Слот больше недоступен или не найден.</p>
      <RouteLink to={consultationLegacySlotsPath(specialist.userId)}>
        К свободным слотам</RouteLink>
    </section>;
  if(routeMode&&routeSlotId&&query.isPending)
    return <Loading message="Проверяем выбранный слот…" />;
  if(visibleSlot&&query.isSuccess&&query.data.eligibility.canBook&&
      mockTransport?.fixtureKind==="AG2_BOOKING_SYNTHETIC_ONLY"){
    if(attempted.has(visibleSlot.id)&&!activeAttempt){
      return <section className="empty-state" role="status">
        <p>Этот слот уже проверялся в текущей сессии макета.
          Повторная отправка запрещена — проверьте мои записи.</p>
        <button type="button" onClick={onMyBookings}>К моим записям</button>
        <button className="button-secondary" type="button"
          onClick={exitForm}>К свободным слотам</button>
      </section>;
    }
    return <ConsultationBookingMockForm key={visibleSlot.id}
      slot={visibleSlot} specialist={specialist} username={username}
      transport={mockTransport}
      onAttempt={()=>{setActiveAttempt(true);onAttempt(visibleSlot.id);}}
      onExit={exitForm} onMyBookings={onMyBookings}
      isSessionCurrent={isSessionCurrent}/>;
  }
  return <section aria-label="Свободное время специалиста"
    className="consultations-slots">
    <BackButton type="button" onClick={onBack}>К специалистам</BackButton>
    <h3>{specialist.name} · Свободное время</h3>
    <p className="note">Все даты и время — МСК (UTC+3).
      Просмотр не создаёт запись.</p>
    {query.isPending&&<Loading message="Загружаем свободные слоты…" />}
    {query.isError&&<div role="alert" className="empty-state">
      <p>{errorText(query.error,"slots")}</p>
      <PrimaryButton type="button" onClick={()=>void query.refetch()}>Повторить</PrimaryButton>
    </div>}
    {query.isSuccess&&<>
      <EligibilityNotice value={query.data.eligibility}/>
      {query.data.items.length===0?<p className="empty-state" role="status">
        На ближайшие две недели свободного времени нет.
      </p>:<ul className="consultation-slot-list">
        {query.data.items.map(slot=><li key={slot.id}>
          <time dateTime={slot.startAtUtc}>{mskLabel(slot.startAtUtc)}</time>
          <span className="consultations-status">Свободно</span>
          {mockTransport?.fixtureKind==="AG2_BOOKING_SYNTHETIC_ONLY"&&
            query.data.eligibility.canBook&&
            <PrimaryButton type="button" disabled={attempted.has(slot.id)}
              onClick={()=>routeMode?navigate(consultationPath({
                kind:"booking",trainerId:specialist.userId,slotId:slot.id,
              })):setSelectedSlot(slot)}>
              {attempted.has(slot.id)?"Уже проверен в макете":
                "Открыть форму (макет)"}
            </PrimaryButton>}
        </li>)}
      </ul>}
      <p className="note">Бронирование и оплата не выполняются.</p>
    </>}
  </section>;
}
function SpecialistList({ownerId,username,loaders,range,mockTransport,
  attempted,onAttempt,onMyBookings,isSessionCurrent,routeMode=false,
  routeView=null,
}:{
  ownerId:string;username:string;loaders:ConsultationsReadLoaders;range:SlotRange;
  mockTransport?:BookingSourceMockTransport;attempted:Set<string>;
  onAttempt:(slotId:string)=>void;onMyBookings:()=>void;
  isSessionCurrent:()=>boolean;
  routeMode?:boolean;routeView?:ConsultationRouteView|null;
}){
  const [selected,setSelected]=useState<Specialist|null>(null);
  const [profileId,setProfileId]=useState<string|null>(null);
  const query=useQuery({
    queryKey:["consultations","specialists",ownerId],
    queryFn:loaders.specialists??getSpecialists,
    retry:false,staleTime:0,gcTime:0,
  });
  const targetId=routeMode?routeView?.trainerId:null;
  const matched=targetId&&query.data?.items.find(row=>row.userId===targetId);
  if(routeMode&&targetId&&query.isSuccess&&!matched)
    return <section role="alert" className="empty-state">
      <p>Кинолог не найден в опубликованном списке.</p>
      <RouteLink to="/consultations">К специалистам</RouteLink>
    </section>;
  if(routeMode&&targetId&&query.isError)
    return <section role="alert" className="empty-state">
      <p>{errorText(query.error,"catalog")}</p>
      <PrimaryButton type="button" onClick={()=>void query.refetch()}>Повторить</PrimaryButton>
    </section>;
  if(routeMode&&targetId&&query.isPending)
    return <Loading message="Проверяем опубликованного кинолога…" />;
  if(routeMode&&matched&&routeView?.kind==="trainer")
    return <ConsultationPublicTrainerProfile
      key={matched.userId} viewerId={ownerId} userId={matched.userId}
      load={loaders.specialists??getSpecialists}
      isCurrent={isSessionCurrent}
      onBack={()=>navigate(consultationPath({kind:"list"}))}
      onSlots={()=>navigate(consultationLegacySlotsPath(matched.userId))}/>;
  if(routeMode&&matched&&(routeView?.kind==="slots"||
      routeView?.kind==="booking"))
    return <SlotCalendar key={matched.userId} userId={ownerId}
      username={username} specialist={matched} range={range}
      loader={loaders.slots??getSpecialistSlots}
      onBack={()=>navigate(consultationPath({kind:"trainer",
        trainerId:matched.userId}))}
      mockTransport={mockTransport} attempted={attempted}
      onAttempt={onAttempt} onMyBookings={onMyBookings}
      isSessionCurrent={isSessionCurrent} routeMode
      routeSlotId={routeView.slotId??null}/>;
  if(profileId)return <ConsultationPublicTrainerProfile
    key={profileId} viewerId={ownerId} userId={profileId}
    load={loaders.specialists??getSpecialists}
    isCurrent={isSessionCurrent} onBack={()=>setProfileId(null)}/>;
  if(selected)return <SlotCalendar
    key={selected.userId} userId={ownerId} username={username}
    specialist={selected} range={range} loader={loaders.slots??getSpecialistSlots}
    onBack={()=>setSelected(null)} mockTransport={mockTransport}
    attempted={attempted} onAttempt={onAttempt}
    onMyBookings={onMyBookings} isSessionCurrent={isSessionCurrent}/>;
  return <section aria-label="Доступные специалисты">
    <h3>Доступные специалисты</h3>
    {query.isPending&&<Loading message="Загружаем специалистов…" />}
    {query.isError&&<div role="alert" className="empty-state">
      <p>{errorText(query.error,"catalog")}</p>
      <PrimaryButton type="button" onClick={()=>void query.refetch()}>Повторить</PrimaryButton>
    </div>}
    {query.isSuccess&&<>
      <EligibilityNotice value={query.data.eligibility}/>
      {query.data.items.length===0?<p className="empty-state" role="status">
        Пока нет доступных кинологов для консультации.
      </p>:<ul className="consultation-specialists-grid">
        {query.data.items.map(s=><li key={s.userId}>
          <article className="consultation-specialist-card">
            <div className="consultation-specialist-symbol" aria-hidden>
              {s.name.trim().slice(0,1).toUpperCase()}
            </div>
            <h4>{s.name}</h4>
            {s.about&&<p>{s.about}</p>}
            <p className="note">Консультация · {s.slotDurationMin} мин · МСК</p>
            <div className="consultation-trainer-actions">
              {routeMode?
                <RouteLink to={consultationPath({kind:"trainer",trainerId:s.userId})}>
                  Профиль кинолога (макет)</RouteLink>:
                <button type="button" onClick={()=>setProfileId(s.userId)}>
                  Профиль кинолога (макет)</button>}
              {routeMode?
                <RouteLink to={consultationLegacySlotsPath(s.userId)}>
                  Посмотреть свободное время</RouteLink>:
                <button type="button" onClick={()=>setSelected(s)}>
                  Посмотреть свободное время</button>}
            </div>
          </article>
        </li>)}
      </ul>}
    </>}
  </section>;
}
function MyBookings({ownerId,username,loader}:{
  ownerId:string;username:string;
  loader:(username:string,cursor:string|null)=>Promise<BookingsPage>;
}){
  const query=useInfiniteQuery({
    queryKey:["consultations","my",ownerId,username],
    queryFn:({pageParam})=>loader(username,pageParam),
    initialPageParam:null as string|null,
    getNextPageParam:data=>data.nextCursor??undefined,
    retry:false,staleTime:0,gcTime:0,
  });
  const bookings=query.data?.pages.flatMap(page=>page.items)??[];
  return <section aria-label="Мои консультации">
    <h3>Мои записи</h3>
    <p className="note">Время отображается по Москве (UTC+3).
      Статусы приходят с сервера.</p>
    {query.isPending&&<Loading message="Загружаем мои консультации…" />}
    {query.isError&&<div className="empty-state" role="alert">
      <p>{errorText(query.error,"mine")}</p>
      <PrimaryButton type="button" onClick={()=>void query.refetch()}>Повторить</PrimaryButton>
    </div>}
    {query.isSuccess&&bookings.length===0&&<p role="status"
      className="empty-state">У вас пока нет записей на консультации.</p>}
    {query.isSuccess&&bookings.length>0&&<ul className="consultation-bookings-list">
      {bookings.map(b=><li key={b.id}>
        <article className="consultation-booking-card">
          <span className="consultations-status">{statusCopy[b.status]}</span>
          <h4>{b.cynologistName||"Кинолог"}</h4>
          <p><time dateTime={b.slot.startAtUtc}>
            {mskLabel(b.slot.startAtUtc)}
          </time></p>
          {b.petName&&<p className="note">Питомец: {b.petName}</p>}
          {b.status==="CANCELLED_BY_TRAINER"&&b.cancelReason&&
            <p className="note">Комментарий кинолога: {b.cancelReason}</p>}
        </article>
      </li>)}
    </ul>}
    {query.isSuccess&&query.hasNextPage&&
      <button type="button" className="button-secondary"
        disabled={query.isFetchingNextPage}
        onClick={()=>void query.fetchNextPage()}>
        {query.isFetchingNextPage?"Загружаем…":"Показать ещё записи"}
      </button>}
    {query.isSuccess&&<p className="note">
      Отмена, оплата и переход в видеовстречу пока недоступны.
    </p>}
  </section>;
}
export function ConsultationReadOnlyPanel({userId,username,
  loaders={},now=new Date(),bookingMockTransport,isSessionCurrent=()=>true,
  attemptedMockSlots,onAttemptMockSlot,routeMode=false,routeView=null,
}:{
  userId:string;username:string;loaders?:ConsultationsReadLoaders;now?:Date;
  bookingMockTransport?:BookingSourceMockTransport;
  isSessionCurrent?:()=>boolean;
  attemptedMockSlots?:Set<string>;
  onAttemptMockSlot?:(slotId:string)=>void;
  routeMode?:boolean;routeView?:ConsultationRouteView|null;
}){
  const [tab,setTab]=useState<"specialists"|"my">("specialists");
  const effectiveTab=routeMode?
    routeView?.kind==="mine"?"my":"specialists":tab;
  const setView=(view:"specialists"|"my")=>{
    if(routeMode)navigate(consultationPath({kind:view==="my"?"mine":"list"}));
    else setTab(view);
  };
  const [range]=useState(()=>consultationRange(now));
  const [localAttempted,setLocalAttempted]=useState<Set<string>>(()=>new Set());
  const attempted=attemptedMockSlots??localAttempted;
  const onAttempt=onAttemptMockSlot??((slotId:string)=>
    setLocalAttempted(prev=>new Set([...prev,slotId])));
  return <section className="consultations-readonly" aria-label="Консультации">
    <header className="consultations-readonly-header">
      <div><h2>Консультации с кинологом</h2>
        <p className="note">Выберите специалиста или посмотрите свои записи</p></div>
      <RouteLink to="/profile">Мой профиль</RouteLink>
    </header>
    <nav className="consultations-readonly-nav" aria-label="Разделы консультаций">
      <button type="button" aria-pressed={effectiveTab==="specialists"}
        className={effectiveTab==="specialists"?"consult-active":"button-secondary"}
        onClick={()=>setView("specialists")}>Специалисты</button>
      <button type="button" aria-pressed={effectiveTab==="my"}
        className={effectiveTab==="my"?"consult-active":"button-secondary"}
        onClick={()=>setView("my")}>Мои записи</button>
    </nav>
    {effectiveTab==="specialists"?<SpecialistList
      ownerId={userId} username={username} loaders={loaders} range={range}
      mockTransport={bookingMockTransport} attempted={attempted}
      onAttempt={onAttempt} onMyBookings={()=>setView("my")}
      isSessionCurrent={isSessionCurrent}
      routeMode={routeMode} routeView={routeView}/>:
      <MyBookings ownerId={userId} username={username}
        loader={loaders.mine??getMyConsultations}/>}
  </section>;
}
