import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { callTrainerConsultationMethod } from "./consultationHttpConsumer";
import { verifiedBookings } from "./verifiedTrainerBookings";
import { matchesCatalogSearch } from "./live/trainerCatalogSearch";
import { trainerStaffMethods, type PanelActor } from "./consultationContract";

import { previewPageState } from "./routes";
import {TrainerAvailabilityEditor} from "./TrainerAvailabilityEditor";
import {
  TrainerBookingCompleteAction,TrainerBookingConfirmAction,TrainerBookingNoShowAction,
  TrainerBookingRejectAction,
  type TrainerBookingRecord
} from "./TrainerBookingConfirmAction";

const formatMoscow = (date: string) => new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow", day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit",
}).format(new Date(date)) + " МСК";
const presentPet = (name?: string | null, breed?: string | null) =>
  [name?.trim(), breed?.trim()].filter(Boolean).join(" · ");
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
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("ALL");
  const [sort,setSort]=useState<"upcoming"|"recent">("upcoming");
  const [page,setPage]=useState(0);
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
  const statusName=(status:string)=>( {
    PENDING_TRAINER_CONFIRMATION:"Ожидает подтверждения",
    CONFIRMED:"Подтверждена", COMPLETED:"Завершена",
    CANCELLED_BY_TRAINER:"Отменена тренером", CANCELLED_BY_USER:"Отменена клиентом",
    CANCELLED_BY_SLA:"Отменена по сроку", CANCELLED_BY_SYSTEM:"Отменена системой",
    NO_SHOW:"Клиент не пришёл",
  } as Record<string,string>)[status]??status;
  const rows = verifiedNow && state.kind==="ready" ? state.bookings??[] : [];
  const statuses = [...new Set(rows.map(item=>item.status))].sort();
  const filtered = rows.filter(item=>
    (statusFilter==="ALL"||item.status===statusFilter)&&
    matchesCatalogSearch(search,[item.id,item.status,statusName(item.status),
      item.slot.startAtUtc,item.slot.endAtUtc,item.clientUsername,
      item.clientOwnerName,item.petName,item.petBreed,item.clientProblem])
  ).sort((a,b)=>{
    const pendingA = a.status === "PENDING_TRAINER_CONFIRMATION";
    const pendingB = b.status === "PENDING_TRAINER_CONFIRMATION";
    if (pendingA !== pendingB) return pendingA ? -1 : 1;
    return sort === "recent" ? b.slot.startAtUtc.localeCompare(a.slot.startAtUtc) :
      a.slot.startAtUtc.localeCompare(b.slot.startAtUtc);
  });
  const pages=Math.max(1,Math.ceil(filtered.length/12));
  const activePage=Math.min(page,pages-1);
  const shown=filtered.slice(activePage*12,(activePage+1)*12);
  const message = !descriptor ? "Маршрут не подключён"
    : pageState !== "mock-only" || !verifiedNow ? "Доступ к данным не предоставлен"
      : state.kind === "loading" ? "Загрузка консультаций"
        : state.kind === "ready" ? "Данные получены" + (state.count === undefined ? "" : ": " + state.count)
          : state.kind === "failed" ? "Не удалось получить данные. Повторная запись не выполняется." : "Нет данных";
  return createElement("section", { "data-consumer": "trainer-source-preview",
    "aria-label": "Консультации", className:"trainer-workspace-consultations" },
    createElement("h2", null, descriptor?.id===1 ? "Мои консультации" : "Моё расписание"),
    createElement("p", { className:"trainer-workspace-count",
      role: state.kind === "failed" ? "alert" : "status" }, message),
    verifiedNow && descriptor?.id===1 && state.kind==="ready" ?
      createElement("div",{className:"trainer-workspace-kpis trainer-workspace-kpis-small"},
        createElement("div",null,createElement("span",null,"Всего записей"),
          createElement("strong",null,rows.length)),
        createElement("div",null,createElement("span",null,"Ожидают подтверждения"),
          createElement("strong",null,rows.filter(x=>x.status===
            "PENDING_TRAINER_CONFIRMATION").length)),
        createElement("div",null,createElement("span",null,"Подтверждены"),
          createElement("strong",null,rows.filter(x=>x.status==="CONFIRMED").length))) : null,
    verifiedNow && descriptor?.id===1 && state.kind==="ready" && rows.length>0 ?
      createElement("div",{className:"trainer-workspace-filters"},
        createElement("label",{className:"trainer-workspace-search"},"Поиск бронирования",
          createElement("input",{type:"search",value:search,
            placeholder:"Клиент, питомец, проблема, дата или ID…",onChange:e=>{
              setSearch(e.currentTarget.value);setPage(0);
            }})),
        createElement("label",null,"Статус",
          createElement("select",{value:statusFilter,onChange:e=>{
            setStatusFilter((e.currentTarget as HTMLSelectElement).value);setPage(0);
          }},createElement("option",{value:"ALL"},"Все статусы"),
            ...statuses.map(value=>createElement("option",{key:value,value},statusName(value))))),
        createElement("label",null,"Сортировка",
          createElement("select",{value:sort,onChange:e=>{
            setSort((e.currentTarget as HTMLSelectElement).value as "recent"|"upcoming");setPage(0);
          }},createElement("option",{value:"upcoming"},"По дате встречи"),
            createElement("option",{value:"recent"},"Сначала поздние")))) : null,
    verifiedNow && descriptor?.id===1 && state.kind==="ready" && rows.length>0 ?
      createElement("p",{className:"trainer-workspace-count"},
        `Показано: ${shown.length} · Найдено: ${filtered.length} из ${rows.length}`) : null,
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
    verifiedNow && descriptor?.id===1 && state.kind==="ready" && rows.length>0 && filtered.length===0
      ?createElement("p",{role:"status",className:"trainer-workspace-empty"},
        "По выбранным фильтрам записей нет") : null,
    verifiedNow && descriptor?.id===1 && state.kind==="ready" && shown.length>0
      ?createElement("ul",{"aria-label":"Список консультаций",
          className:"trainer-workspace-bookings"},
          ...shown.map(item=>createElement("li",{key:item.id,"data-booking-id":item.id,
            className:"trainer-workspace-booking"},
            createElement("span",null,"Запись "+item.id),
            item.clientUsername ? createElement("strong",
              {className:"trainer-workspace-booking-person"},"@"+item.clientUsername) : null,
            item.petName || item.petBreed ? createElement("span",
              {className:"trainer-workspace-booking-pet"},
              "Питомец: "+presentPet(item.petName,item.petBreed)) : null,
            createElement("span",{className:"trainer-workspace-status " +
              (item.status==="CONFIRMED"||item.status==="COMPLETED"?"is-done":
                item.status==="PENDING_TRAINER_CONFIRMATION"?"is-pending":"")},
              statusName(item.status),
              createElement("small", { className:"trainer-workspace-raw-status",
                "aria-hidden":true }, item.status)),
            createElement("time",{dateTime:item.slot.startAtUtc},formatUTC(item.slot.startAtUtc)),
            createElement("span",null," — "),
            createElement("time",{dateTime:item.slot.endAtUtc},formatUTC(item.slot.endAtUtc)),
            createElement("small",{className:"trainer-workspace-booking-moscow"},
              "Встреча: "+formatMoscow(item.slot.startAtUtc)),
            item.status === "PENDING_TRAINER_CONFIRMATION" && item.confirmationDeadlineAt ?
              createElement("small",{className:"trainer-workspace-booking-deadline"},
                "Подтвердить до: "+formatMoscow(item.confirmationDeadlineAt)) : null,
            [item.clientUsername,item.clientOwnerName,item.clientPhone,item.petName,
              item.petBreed,item.clientProblem,item.clientSelfHelpAttempt,item.cancelReason]
              .some(value=>typeof value === "string" && value.trim().length>0) ?
              createElement("details",{className:"trainer-workspace-intake"},
                createElement("summary",null,"Данные заявки"),
                createElement("dl",null,
                  ...([ ["Ник в Гафусе",item.clientUsername],
                    ["Владелец",item.clientOwnerName], ["Телефон",item.clientPhone],
                    ["Питомец",item.petName], ["Пол питомца",item.petGender],
                    ["Возраст питомца",item.petAge], ["Порода",item.petBreed],
                    ["Проблема",item.clientProblem],
                    ["Самостоятельные попытки",item.clientSelfHelpAttempt],
                    ["Комментарий при отмене",item.cancelReason],
                  ] as [string,string|null|undefined][])
                    .filter(([,value])=>typeof value==="string" && value.trim().length>0)
                    .flatMap(([label,value])=>[
                      createElement("dt",{key:"dt-"+label},label),
                      createElement("dd",{key:"dd-"+label},value),
                    ]))) : null,
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
      :null,
    verifiedNow && descriptor?.id===1 && state.kind==="ready" && filtered.length>12 ?
      createElement("footer",{className:"trainer-workspace-pages"},
        createElement("span",null,`Страница ${activePage+1} из ${pages}`),
        createElement("button",{type:"button",disabled:activePage===0,
          onClick:()=>setPage(activePage-1)},"Назад"),
        createElement("button",{type:"button",disabled:activePage+1>=pages,
          onClick:()=>setPage(activePage+1)},"Далее")) : null);
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
