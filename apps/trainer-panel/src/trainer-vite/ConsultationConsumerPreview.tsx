import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { callTrainerConsultationMethod } from "./consultationHttpConsumer";
import { verifiedBookings } from "./verifiedTrainerBookings";
import { trainerStaffMethods, type PanelActor } from "./consultationContract";

import { previewPageState } from "./routes";
import {TrainerAvailabilityEditor} from "./TrainerAvailabilityEditor";
import {
  TrainerBookingCompleteAction,TrainerBookingConfirmAction,TrainerBookingNoShowAction,
  TrainerBookingRejectAction,
  type TrainerBookingRecord
} from "./TrainerBookingConfirmAction";

const formatUTC=(date:string)=>{
  const time=Date.parse(date);
  return Number.isFinite(time)
    ?new Date(time).toISOString().slice(0,16).replace("T"," ")+" UTC"
    :"Время уточняется";
};

/** Opt-in Vite consumer preview only; not mounted by legacy Next or app routes. */
function TrainerBookingConsumerPreview(props: {
  pathname: string; actor: PanelActor; token: string | null; fetchImpl: typeof fetch;
  authEpoch?: string;
  getCurrentSession?: () => {
    actor:PanelActor;token:string|null;authEpoch?:string;
  } | null;
}): ReactElement {
  const {pathname,actor,token,authEpoch,getCurrentSession,fetchImpl}=props;
  const stableActor=useMemo<PanelActor>(()=>({id:actor.id,role:actor.role}),
    [actor.id,actor.role]);
  // A shared booking fence prevents simultaneous sibling mutations.
  const bookingLocks=useRef<Map<string,string>>(new Map());
  // Stable principal identity, not the transient React props object identity.
  const principalKey=JSON.stringify([actor.id,actor.role,token,authEpoch,pathname]);
  const lockedPrincipal=useRef(principalKey);
  const current=useRef({actor,token,authEpoch});
  current.current={actor:stableActor,token,authEpoch};
  const readerRef=useRef(getCurrentSession);
  readerRef.current=getCurrentSession;
  const readLive=useCallback(()=>readerRef.current
    ?readerRef.current():current.current,[]);
  const descriptor = pathname === "/main-panel/consultations" ? trainerStaffMethods[0]
    : pathname === "/main-panel/consultations/availability" ? trainerStaffMethods[5] : null;
  const pageState = previewPageState(pathname, actor.role);
  const [state, setState] = useState<{ kind: "idle" | "loading" | "ready" | "failed"; count?: number; bookings?: TrainerBookingRecord[] }>({ kind: "idle" });
  const [retryVersion,setRetryVersion]=useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ kind: "idle" });
    if(lockedPrincipal.current!==principalKey){
      bookingLocks.current.clear();
      lockedPrincipal.current=principalKey;
    }
    const initial={actor:stableActor,token,authEpoch};
    const stillValid=()=>{
      const v=readLive();
      return !!v
        &&v.actor.role===initial.actor.role
        &&v.actor.id===initial.actor.id
        &&v.token===initial.token
        &&v.authEpoch===initial.authEpoch;
    };
    // A stale mounted snapshot must not send a private Bearer GET in the first place.
    if (!descriptor || pageState !== "mock-only" || !token || !stillValid())
      return () => { active = false; controller.abort(); };
    setState({ kind: "loading" });
    callTrainerConsultationMethod({
      descriptor, actor:stableActor, accessToken: token, fetchImpl,
      signal: controller.signal,
    }).then(data => {
      if (!active || !stillValid()) return;
      if (descriptor.id === 1) {
        if (!verifiedBookings(data, stableActor)) throw new Error("INVALID_OR_FOREIGN_BOOKINGS");
        const bookings = data;
        setState({kind:"ready",count:bookings.length,bookings});
      } else setState({kind:"ready"});
    }).catch(() => { if (active && stillValid()) setState({ kind: "failed" }); });
    return () => { active = false; controller.abort(); };
  }, [descriptor,pageState,stableActor,token,authEpoch,readLive,
      fetchImpl,principalKey,retryVersion]);
  useEffect(()=>{
    if(state.kind!=="ready"||!state.bookings)return;
    for(const [id,prior] of bookingLocks.current){
      const record=state.bookings.find(row=>row.id===id);
      if(record&&record.status!==prior)bookingLocks.current.delete(id);
    }
  },[state]);
  // Session providers can retire an actor between requests; never show cached private rows.
  const sessionNow=readLive();
  const verifiedNow=!!sessionNow&&!!token&&sessionNow.actor.role===actor.role&&
    sessionNow.actor.id===actor.id&&sessionNow.token===token&&
    sessionNow.authEpoch===authEpoch;
  const message = !descriptor ? "Маршрут не подключён"
    : pageState !== "mock-only" || !verifiedNow ? "Доступ к данным не предоставлен"
      : state.kind === "loading" ? "Загрузка консультаций"
        : state.kind === "ready" ? "Данные получены" + (state.count === undefined ? "" : ": " + state.count)
          : state.kind === "failed" ? "Не удалось получить данные. Повторная запись не выполняется." : "Нет данных";
  return createElement("section", { "data-consumer": "trainer-source-preview", "aria-label": "Консультации" },
    createElement("h2", null, descriptor?.id===1 ? "Мои консультации" : "Моё расписание"),
    createElement("p", { role: state.kind === "failed" ? "alert" : "status" }, message),
    verifiedNow && actor.role==="TRAINER" && descriptor?.id===1 && state.kind==="failed"
      ?createElement("button",{
        type:"button","aria-label":"Повторить загрузку консультаций",
        onClick:()=>{
          const live=readLive();
          if(!live||live.actor.id!==actor.id||live.actor.role!==actor.role||
             live.authEpoch!==authEpoch||live.token!==token)return;
          setRetryVersion(value=>value+1);
        }
      },"Повторить загрузку")
      :null,
    verifiedNow && descriptor?.id===1 && state.kind==="ready" && state.bookings?.length===0
      ?createElement("p",{role:"note"},"Записей пока нет")
      :null,
    verifiedNow && descriptor?.id===1 && state.kind==="ready" && state.bookings?.length
      ?createElement("ul",{"aria-label":"Список консультаций"},
          ...state.bookings.map(item=>createElement("li",{key:item.id,"data-booking-id":item.id},
            createElement("span",null,"Запись "+item.id),
            createElement("span",null," · "+item.status+" · "),
            createElement("time",{dateTime:item.slot.startAtUtc},formatUTC(item.slot.startAtUtc)),
            createElement("span",null," — "),
            createElement("time",{dateTime:item.slot.endAtUtc},formatUTC(item.slot.endAtUtc)),
            item.status === "CONFIRMED" && (() => {
              const start = Date.parse(item.slot.startAtUtc);
              const end = Date.parse(item.slot.endAtUtc);
              const now = Date.now();
              return Number.isFinite(start) && Number.isFinite(end) &&
                now >= start - 15 * 60_000 && now <= end + 60 * 60_000;
            })() ? createElement("a", {
              href: "/main-panel/consultations/call/" + encodeURIComponent(item.id),
              "aria-label": "Войти в видеоконсультацию",
            }, "Войти в видеовстречу") : null,
            ...[
              TrainerBookingConfirmAction,
              TrainerBookingCompleteAction,
              TrainerBookingNoShowAction,
              TrainerBookingRejectAction
            ].map(
              (Action,idx)=>createElement(Action,{
                key:idx,booking:item,actor,token:token??"",authEpoch,getCurrentSession,fetchImpl,
                beginMutation:(id:string,status:string)=>{
                  if(bookingLocks.current.has(id))return false;
                  bookingLocks.current.set(id,status);
                  return true;
                },
                onVerifiedRefresh:(updated:TrainerBookingRecord[])=>{
                  const live=readLive();
                  if(!live||live.actor.id!==actor.id||live.actor.role!==actor.role||
                    live.token!==token||live.authEpoch!==authEpoch)
                    throw new Error("STALE_BOOKING_REFRESH");
                  if (!verifiedBookings(updated, actor))
                    throw new Error("INVALID_BOOKING_REFRESH");
                  setState({kind:"ready",count:updated.length,bookings:updated});
                },
              })
            ))))
      :null);
}


/** Live opt-in route choice: preserve existing booking consumer unchanged. */
export function ConsultationConsumerPreview(props:{
 pathname:string;actor:PanelActor;token:string|null;fetchImpl:typeof fetch;
 authEpoch?:string;
 getCurrentSession?:()=>{actor:PanelActor;token:string|null;authEpoch?:string}|null;
}):ReactElement {
 return props.pathname==="/main-panel/consultations/availability"
   ?createElement(TrainerAvailabilityEditor,props)
   :createElement(TrainerBookingConsumerPreview,props);
}
