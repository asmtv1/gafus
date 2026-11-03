import {createElement,useEffect,useRef,useState,type ChangeEvent,type ReactElement} from "react";
import {callTrainerConsultationMethod} from "./consultationHttpConsumer";
import {verifiedBookings} from "./verifiedTrainerBookings";
import {trainerStaffMethods,type PanelActor} from "./consultationContract";

export type TrainerBookingRecord = {
  id:string; status:string; cynologistUserId:string;
  slot:{id:string;startAtUtc:string;endAtUtc:string;status?:string};
  cancelReason?:string|null;
  clientUsername?:string|null;
  clientOwnerName?:string|null;
  clientPhone?:string|null;
  petName?:string|null;
  petGender?:string|null;
  petAge?:string|null;
  petBreed?:string|null;
  clientProblem?:string|null;
  clientSelfHelpAttempt?:string|null;
  confirmationDeadlineAt?:string|null;
};
type Session = {actor:PanelActor;token:string|null;authEpoch?:string};
type Phase = "idle"|"question"|"saving"|"refreshing"|"confirmed"|"uncertain"|"blocked";

/** A confirmed POST alone is not proof: require fresh owner-scoped GET status. */
export function TrainerBookingTransitionAction(p:{
  mode:"confirm"|"complete"|"noShow"|"reject";
  booking:TrainerBookingRecord;actor:PanelActor;token:string;
  authEpoch?:string;getCurrentSession?:()=>Session|null;fetchImpl:typeof fetch;
  onVerifiedRefresh:(bookings:TrainerBookingRecord[])=>void;
  beginMutation?:(bookingId:string,status:string)=>boolean;
}):ReactElement|null {
  const {booking,actor,token,authEpoch,getCurrentSession,fetchImpl,onVerifiedRefresh,mode}=p;
  const beforeStatus=mode==="confirm"?"PENDING_TRAINER_CONFIRMATION":"CONFIRMED";
  const eligible=mode==="reject"
    ? booking.status==="PENDING_TRAINER_CONFIRMATION"||booking.status==="CONFIRMED"
    : booking.status===beforeStatus;
  const afterStatus=mode==="confirm"?"CONFIRMED"
    :mode==="complete"?"COMPLETED":mode==="noShow"?"NO_SHOW":"CANCELLED_BY_TRAINER";
  const rejectPending=booking.status==="PENDING_TRAINER_CONFIRMATION";
  const rejectLabel=rejectPending?"Отклонить заявку":"Отменить встречу";
  const actionName=mode==="confirm"?"Подтвердить запись":mode==="complete"?"Завершить консультацию"
    :mode==="noShow"?"Отметить неявку клиента в записи":rejectLabel;
  const actionButton=mode==="confirm"?"Да, подтвердить":mode==="complete"?"Да, завершить"
    :mode==="noShow"?"Да, отметить неявку":rejectPending?"Да, отклонить":"Да, отменить встречу";
  const unknownResult=mode==="confirm"?"Результат подтверждения неизвестен"
    :mode==="complete"?"Результат завершения неизвестен":mode==="noShow"
      ?"Результат отметки неявки неизвестен":"Результат отклонения/отмены неизвестен";
  const [phase,setPhase]=useState<Phase>("idle");
  const [reason,setReason]=useState("");
  const inFlight=useRef(false);
  const mounted=useRef(true);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;controller.current?.abort();inFlight.current=false;};
  },[actor.id,actor.role,token,authEpoch,booking.id,getCurrentSession,mode]);

  const sessionValid=()=>{
    const current=getCurrentSession?.()??(getCurrentSession?null:{actor,token,authEpoch});
    return !!current&&!!current.token&&current.token===token&&
      current.actor.id===actor.id&&current.actor.role===actor.role&&
      current.authEpoch===authEpoch;
  };
  // A retired principal must never see a cached confirmation dialog or reason.
  if(!eligible||!["TRAINER","ADMIN"].includes(actor.role)||!sessionValid()||
    (actor.role==="TRAINER"&&booking.cynologistUserId!==actor.id))return null;

  const confirm=async()=>{
    if(inFlight.current||phase!=="question"||!sessionValid()||!mounted.current||
      (mode==="reject"&&reason.length>500))return;
    if(p.beginMutation&&!p.beginMutation(booking.id,booking.status)){
      setPhase("blocked");return;
    }
    inFlight.current=true;
    const signal=new AbortController();controller.current=signal;
    setPhase("saving");
    try{
      const response=await callTrainerConsultationMethod({
        descriptor:trainerStaffMethods[mode==="confirm"?1:mode==="complete"?2:mode==="noShow"?3:4],
        actor,resourceId:booking.id,
        ...(mode==="reject"?{body:{reason:reason.trim()}}:{}),
        accessToken:token,fetchImpl,signal:signal.signal,
      });
      if(!mounted.current||!sessionValid()||signal.signal.aborted)return;
      if(typeof response!=="object"||!response||
        !("bookingId" in response)||response.bookingId!==booking.id)
        throw new Error("UNCONFIRMED_BOOKING_ID");
      setPhase("refreshing");
      const latest=await callTrainerConsultationMethod({
        descriptor:trainerStaffMethods[0],actor,accessToken:token,
        fetchImpl,signal:signal.signal,
      });
      if(!mounted.current||!sessionValid()||signal.signal.aborted)return;
      if(!verifiedBookings(latest,actor)||
        !latest.some(row=>row.id===booking.id&&row.status===afterStatus&&
          (mode!=="reject"||
            (row.slot.status==="FREE"&&
              (!reason.trim()||row.cancelReason===reason.trim())))))
        throw new Error("UNCONFIRMED_BOOKING_STATUS");
      onVerifiedRefresh(latest);
      setPhase("confirmed");
    }catch{
      if(mounted.current&&sessionValid()&&!signal.signal.aborted)
        setPhase("uncertain");
    }finally{
      inFlight.current=false;
      if(controller.current===signal)controller.current=null;
    }
  };
  if(phase==="confirmed")return createElement("p",{role:"status"},mode==="confirm"?"Подтверждение проверено по списку":mode==="complete"?"Завершение проверено по списку"
      :mode==="noShow"?"Неявка проверена по списку":"Отмена проверена по списку");
  if(phase==="blocked")return createElement("p",{role:"alert"},
    "Для этой записи уже выполняется действие или нужен ручной контроль. Обновите список.");
  if(phase==="uncertain")return createElement("p",{role:"alert"},
    unknownResult+". Проверьте запись; повторный запрос автоматически не отправляется.");
  if(phase==="saving"||phase==="refreshing")return createElement("p",{role:"status"},
    phase==="saving"?(mode==="confirm"?"Подтверждаем запись…":mode==="complete"?"Завершаем консультацию…"
      :mode==="noShow"?"Отмечаем неявку…":"Отменяем бронирование…"):"Проверяем обновлённый список…");
  if(phase==="question")return createElement("div",{"data-confirm-question":booking.id},
    createElement("p",null,actionName+" "+booking.id+"?"),
    mode==="noShow"||mode==="reject"
      ?createElement("p",null,"Бронирование изменится, клиент получит уведомление."):null,
    mode==="reject"?createElement("label",null,"Причина (необязательно)",
      createElement("textarea",{
        name:"reason",maxLength:500,value:reason,
        onChange:(event:ChangeEvent<HTMLTextAreaElement>)=>setReason(event.currentTarget.value),
        "aria-label":"Причина отклонения или отмены",
      })):null,
    createElement("button",{type:"button",onClick:()=>void confirm()},actionButton),
    createElement("button",{type:"button",onClick:()=>setPhase("idle")},"Отмена"));
  return createElement("button",{type:"button",onClick:()=>{if(sessionValid())setPhase("question");}},
    mode==="confirm"?"Подтвердить":mode==="complete"?"Завершить"
      :mode==="noShow"?"Отметить неявку":rejectLabel);
}
