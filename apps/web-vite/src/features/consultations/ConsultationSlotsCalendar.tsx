import {useEffect,useMemo,useRef,useState} from "react";
import {RouteLink,navigate,consultationPath} from "../../shared/router/location";
import {verifyBookingSlot,consultationError} from "./consultationLiveApi";
import {
  buildConsultationCalendarRangeDays,
  consultationCalendarMonthKey,
  consultationMskDayKey,
  consultationMskDayKeyToDate,
  filterConsultationSlotsExcludingDayOffs,
  formatConsultationDayLabelMsk,
  formatConsultationTimeMsk,
  groupConsultationSlotsByMskDay,
} from "@gafus/consultation-shared";
import type {CalendarSlotsView,SlotRange,Specialist} from "./consultationReadApi";
import styles from "./ConsultationSlotsCalendar.module.css";
import {PrimaryButton} from "../../shared/ui";

/** Original Next two-column 14-day calendar, sourced entirely from the
 * authoritative Hono GET ?includeBusy=1 (including day-offs). Only FREE
 * slots expose a booking action. No local entitlement/availability guess. */
export function ConsultationSlotsCalendar({specialist,calendar,range,refresh,ownerId}:{
  specialist:Specialist;
  ownerId:string;
  calendar:CalendarSlotsView;
  range:SlotRange;
  refresh:()=>void;
}){
  const rangeDays=useMemo(()=>buildConsultationCalendarRangeDays(
    new Date(range.from),new Date(range.to)),[range.from,range.to]);
  const rangeKeys=useMemo(()=>new Set(rangeDays.map(consultationMskDayKey)),[rangeDays]);
  const dayOffKeys=useMemo(()=>new Set(calendar.dayOffDates),[calendar.dayOffDates]);
  const visibleSlots=useMemo(()=>filterConsultationSlotsExcludingDayOffs(
    calendar.items,dayOffKeys),[calendar.items,dayOffKeys]);
  const slotsByDay=useMemo(()=>new Map(groupConsultationSlotsByMskDay(visibleSlots)
    .map(({dateKey,slots})=>[dateKey,slots])),[visibleSlots]);
  const monthKeys=useMemo(()=>[...new Set(rangeDays.map(consultationCalendarMonthKey))],
    [rangeDays]);
  // The preserved Next mounts the calendar before GET completes, choosing
  // the first date in the allowed window. A later GET does not jump to its
  // first FREE date. Avoid Vite-only automatic day selection after loading.
  const initialDay=useMemo(()=>
    rangeDays[0]?consultationMskDayKey(rangeDays[0]):"",
    [rangeDays]);
  const [selectedDayKey,setSelectedDayKey]=useState(initialDay);
  const [selectedMonthKey,setSelectedMonthKey]=useState(initialDay.slice(0,7));
  const [verifyingSlotId,setVerifyingSlotId]=useState<string|null>(null);
  const [verifyError,setVerifyError]=useState("");
  const verifying=useRef(false);
  const currentOwner=useRef(ownerId);
  // A request generation prevents an old owner's late network response from
  // unlocking a newer owner's verification or stranding the new UI disabled.
  const verificationSerial=useRef(0);
  useEffect(()=>{
    currentOwner.current=ownerId;
    verificationSerial.current+=1;
    verifying.current=false;
    setVerifyingSlotId(null);
    setVerifyError("");
  },[ownerId]);
  async function selectSlot(id:string){
    if(verifying.current||!calendar.eligibility.canBook)return;
    verifying.current=true;
    const serial=++verificationSerial.current;
    setVerifyingSlotId(id);setVerifyError("");
    const requestedOwner=ownerId;
    try{
      // Source Next checks the physical slot via its registered owner-only
      // GET before opening the booking form. The final POST verifies again.
      await verifyBookingSlot(specialist.userId,id);
      if(currentOwner.current===requestedOwner&&verificationSerial.current===serial)
        navigate(consultationPath({kind:"booking",trainerId:specialist.userId,slotId:id}));
    }catch(error){
      if(currentOwner.current===requestedOwner&&verificationSerial.current===serial){
        setVerifyError(consultationError(error));
        refresh();
      }
    }finally{
      if(verificationSerial.current===serial){
        verifying.current=false;
        setVerifyingSlotId(null);
      }
    }
  }
  const month=monthKeys.includes(selectedMonthKey)?selectedMonthKey:monthKeys[0]??"";
  const day=rangeKeys.has(selectedDayKey)?selectedDayKey:initialDay;
  const monthIndex=monthKeys.indexOf(month);
  const monthDate=month?consultationMskDayKeyToDate(month+"-01"):null;
  const monthCells=useMemo(()=>{
    const [year,m]=month.split("-").map(Number);
    if(!year||!m)return [] as (string|null)[];
    const firstDay=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7;
    const length=new Date(Date.UTC(year,m,0)).getUTCDate();
    return [...Array.from({length:firstDay},()=>null),
      ...Array.from({length},(_,i)=>`${month}-${String(i+1).padStart(2,"0")}`)];
  },[month]);
  const chosenSlots=slotsByDay.get(day)??[];
  const activeDate=day?consultationMskDayKeyToDate(day):null;
  if(!calendar.eligibility.canBook)return <div className={styles.container}>
    <p role="status">{calendar.eligibility.message??"Новая запись сейчас недоступна."}</p>
    <div className="consult-live-actions">
      <RouteLink to="/consultations/my">Мои консультации</RouteLink>
      <PrimaryButton type="button" onClick={refresh}>Обновить</PrimaryButton>
    </div>
  </div>;
  return <div className={`${styles.container} next-consultation-calendar`}>
    {verifyError&&<p role="alert">{verifyError}</p>}
    <div className={styles.topMeta}>
      <span className={styles.metaPill}>Часовой пояс: МСК (UTC+3)</span>
      <span className={styles.metaPill}>Длительность консультации: до {specialist.slotDurationMin} мин</span>
    </div>
    <div className={styles.layout}>
      <section className={styles.calendarPanel} aria-label="Календарь свободных слотов">
        <div className={styles.calendarHeader}>
          <button type="button" className={styles.calendarNavButton}
            disabled={monthIndex<=0} aria-label="Предыдущий месяц"
            onClick={()=>setSelectedMonthKey(monthKeys[monthIndex-1]??month)}>{"<"}</button>
          <p className={styles.calendarMonth}>{monthDate?
            new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"Europe/Moscow"})
              .format(monthDate):""}</p>
          <button type="button" className={styles.calendarNavButton}
            disabled={monthIndex<0||monthIndex>=monthKeys.length-1}
            aria-label="Следующий месяц"
            onClick={()=>setSelectedMonthKey(monthKeys[monthIndex+1]??month)}>{">"}</button>
        </div>
        <div className={styles.weekdays} aria-hidden="true">
          {(["Пн","Вт","Ср","Чт","Пт","Сб","Вс"] as const).map(w=><span key={w}>{w}</span>)}
        </div>
        <div className={styles.calendarGrid} role="group" aria-label="Выберите день консультации">
          {monthCells.map((key,i)=>{
            if(!key)return <span key={`empty-${i}`} className={styles.emptyCell}/>;
            const inRange=rangeKeys.has(key);
            const dayOff=dayOffKeys.has(key);
            const daySlots=slotsByDay.get(key)??[];
            const available=dayOff?0:daySlots.filter(s=>s.status==="FREE").length;
            const weekend=[0,6].includes(consultationMskDayKeyToDate(key).getUTCDay());
            return <button type="button" key={key} className={styles.dayCell}
              disabled={!inRange} data-consultation-day-key={key}
              aria-label={`${key}: ${available} свободных слотов`}
              aria-pressed={day===key} data-selected={day===key}
              data-in-range={inRange} data-weekend={weekend}
              data-day-off={dayOff} data-no-free-slots={inRange&&available===0}
              onClick={()=>{setSelectedDayKey(key);setSelectedMonthKey(key.slice(0,7));}}>
              <span className={styles.dayNumber}>{Number(key.slice(-2))}</span>
              <span className={styles.dayCount}>{inRange?`${available} св.`:""}</span>
            </button>;
          })}
        </div>
      </section>
      <section className={styles.slotsPanel} aria-label="Время на выбранный день">
        <h3 className={styles.slotsTitle}>{activeDate?
          formatConsultationDayLabelMsk(activeDate):"Слоты"}</h3>
        {chosenSlots.length===0?<div className={styles.emptyState}>
          <p>На выбранный день слотов нет.</p>
        </div>:<div className={styles.slotList}>
          {chosenSlots.map(slot=>{
            const free=slot.status==="FREE";
            return <article className={styles.slotRow} key={slot.id}
              data-status={slot.status}>
              <div>
                <p className={styles.slotTime}>
                  {formatConsultationTimeMsk(new Date(slot.startAtUtc))} - {
                    formatConsultationTimeMsk(new Date(slot.endAtUtc))}
                </p>
                <p className={styles.slotStatus}>{free?"Свободно":slot.status==="BOOKED"?"Занято":"Недоступно"}</p>
              </div>
              {free?<button type="button"
                className={`${styles.slotActionButton} consult-live-calendar-book`}
                disabled={verifyingSlotId!==null}
                onClick={()=>void selectSlot(slot.id)}>
                  {verifyingSlotId===slot.id?"Проверяем слот…":"Выбрать слот"}
                </button>:<button type="button" className={styles.slotActionButton} disabled>
                  Недоступно
                </button>}
            </article>;
          })}
        </div>}
      </section>
    </div>
  </div>;
}
