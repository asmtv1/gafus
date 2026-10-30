import {useEffect,useRef,useState,type ChangeEvent,type FormEvent} from "react";
import {mskLabel,type Slot,type Specialist,type BookingsPage} from "./consultationReadApi";
import {type BookingIntake,type BookingResult,type BookingSourceMockTransport,
  classifyMockBooking,classifyMockReadback,prepareBookingIntent,uuidV4}
  from "./bookingSourceMock";
import {PrimaryButton, Loading} from "../../shared/ui";
type Phase="intake"|"review"|"verifying"|"submitting"|"result";
const blank:BookingIntake={clientOwnerName:"",clientPhone:"",petName:"",
  petGender:"MALE",petAge:"",petBreed:"",clientProblem:"",clientSelfHelpAttempt:""};
const key=():string|null=>{
  try{const v=globalThis.crypto?.randomUUID?.();
    return v&&uuidV4(v)?v:null;}catch{return null;}
};
const denyMessage=(status:number)=>{
  if(status===401)return "Войдите в аккаунт заново.";
  if(status===402)return "Для записи нужна соответствующая подписка.";
  if(status===403)return "Право на запись ограничено сервером.";
  if(status===404||status===409)return "Слот недоступен. Выберите другое время.";
  return "Проверка не пройдена. Вернитесь к свободным слотам.";
};
/** Synthetic-only mounted workflow. No real API/fetch/CSRF/notification.
 * Unknown ACK never allows repeat POST for this slot/owner mount.
 */
export function ConsultationBookingMockForm({slot,specialist,username,
  transport,onExit,onMyBookings,onAttempt,isSessionCurrent,
}:{
  slot:Slot;specialist:Specialist;username:string;
  transport:BookingSourceMockTransport;
  onExit:()=>void;onMyBookings:()=>void;onAttempt:()=>void;
  isSessionCurrent:()=>boolean;
}){
  const [form,setForm]=useState<BookingIntake>(blank);
  const [phase,setPhase]=useState<Phase>("intake");
  const [outcome,setOutcome]=useState<BookingResult|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const [readback,setReadback]=useState<
    "idle"|"loading"|"FOUND_MOCK"|"NOT_PROVEN">("idle");
  const [idemKey]=useState(key);
  const alive=useRef(true);const sent=useRef(false);
  const readbackBusy=useRef(false);
  useEffect(()=>()=>{alive.current=false;},[]);
  const intent=idemKey?prepareBookingIntent(form,slot.id,idemKey):null;
  const input=(field:Exclude<keyof BookingIntake,"petGender">,
    label:string,maxLength:number,kind:"input"|"textarea"="input")=>{
    const attrs={name:field,id:"mock-"+field,value:form[field],
      maxLength,required:true,
      onChange:(e:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>
        setForm(prev=>({...prev,[field]:e.target.value}))};
    return <label key={field} htmlFor={attrs.id}><span>{label}</span>
      {kind==="textarea"?<textarea {...attrs} rows={3}/>:
        <input {...attrs} type={field==="clientPhone"?"tel":"text"}/>}
    </label>;
  };
  const review=(event:FormEvent)=>{
    event.preventDefault();
    if(phase!=="intake"||!intent||sent.current){
      setMessage("Проверьте обязательные поля обращения.");return;
    }
    setMessage(null);setPhase("review");
  };
  const confirm=async()=>{
    if(phase!=="review"||sent.current||!intent||!isSessionCurrent()||
      transport.fixtureKind!=="AG2_BOOKING_SYNTHETIC_ONLY")return;
    sent.current=true;onAttempt();setPhase("verifying");
    try{
      const verify=await transport.verifySlot({
        cynologistUserId:specialist.userId,slotId:slot.id,
      });
      if(!alive.current||!isSessionCurrent())return;
      if(verify.httpStatus!==200||!verify.success){
        setOutcome(verify.httpStatus===409||verify.httpStatus===404?
          {kind:"SLOT_CONFLICT"}:
          [500,503].includes(verify.httpStatus)?{kind:"UNKNOWN"}:
            {kind:"DENIED",status:verify.httpStatus});
        setPhase("result");return;
      }
      setPhase("submitting");
      const reply=await transport.submitBooking({
        cynologistUserId:specialist.userId,body:intent,
      });
      if(!alive.current||!isSessionCurrent())return;
      setOutcome(classifyMockBooking(reply,slot,specialist,username));
      setPhase("result");
    }catch{
      if(alive.current&&isSessionCurrent()){
        setOutcome({kind:"UNKNOWN"});setPhase("result");
      }
    }
  };
  const check=async()=>{
    if(!outcome||!isSessionCurrent()||
      readbackBusy.current||readback!=="idle")return;
    readbackBusy.current=true;setReadback("loading");
    const pages:BookingsPage[]=[];
    try{
      let cursor:string|null=null;
      for(let i=0;i<3;i++){
        const page:BookingsPage=await transport.readbackMy(username,cursor);
        if(!alive.current||!isSessionCurrent())return;
        pages.push(page);
        if(!page.nextCursor)break;
        cursor=page.nextCursor;
      }
      if(alive.current&&isSessionCurrent())setReadback(classifyMockReadback(pages,
        outcome.kind==="ACK_MOCK"?outcome.mockBookingId:null));
    }catch{
      if(alive.current&&isSessionCurrent())setReadback("NOT_PROVEN");
    }finally{readbackBusy.current=false;}
  };
  return <section className="consultation-booking-mock"
    aria-label="Макет записи на консультацию">
    <p role="status" className="consultation-mock-banner">
      Только макет: настоящая бронь не создаётся.
    </p>
    <h3>{phase==="intake"?"Обращение к кинологу":
      phase==="review"?"Подтверждение обращения":
        phase==="result"?"Результат макета":"Обрабатываем макет…"}</h3>
    <p><strong>{specialist.name}</strong> · {mskLabel(slot.startAtUtc)}</p>
    {phase==="intake"&&<form onSubmit={review}>
      {input("clientOwnerName","Имя владельца",15)}
      {input("clientPhone","Телефон с кодом страны",32)}
      {input("petName","Кличка питомца",15)}
      <label htmlFor="mock-petGender"><span>Пол питомца</span>
        <select id="mock-petGender" name="petGender" value={form.petGender}
          onChange={e=>setForm(prev=>({...prev,
            petGender:e.target.value as "MALE"|"FEMALE"}))}>
          <option value="MALE">Мальчик</option>
          <option value="FEMALE">Девочка</option>
        </select>
      </label>
      {input("petAge","Возраст питомца",100)}
      {input("petBreed","Порода питомца",200)}
      {input("clientProblem","Опишите проблему (от 10 символов)",1000,"textarea")}
      {input("clientSelfHelpAttempt","Что уже пробовали",1000,"textarea")}
      {message&&<p role="alert">{message}</p>}
      <div className="consultation-mock-actions">
        <button type="submit">К подтверждению</button>
        <button type="button" className="button-secondary"
          onClick={onExit}>К свободным слотам</button>
      </div>
    </form>}
    {phase==="review"&&<div className="consultation-booking-review">
      <p>Владелец: {form.clientOwnerName.trim()}</p>
      <p>Питомец: {form.petName.trim()}</p>
      <p>Проблема: {form.clientProblem.trim()}</p>
      <p>Отправка только в синтетический transport.</p>
      <div className="consultation-mock-actions">
        <PrimaryButton type="button" onClick={()=>void confirm()}>
          Проверить и отправить макет
        </PrimaryButton>
        <button type="button" className="button-secondary"
          onClick={()=>setPhase("intake")}>Изменить обращение</button>
      </div>
    </div>}
    {(phase==="verifying"||phase==="submitting")&&
      <Loading variant="compact" message={phase==="verifying"?"Проверяем слот…":
        "Ожидаем ответ тестового transport…"} />}
    {phase==="result"&&outcome&&<div className="consultation-mock-result"
      role="status">
      {outcome.kind==="ACK_MOCK"&&<p>
        Получен ACK только от тестового transport.
        Это <strong>не настоящая бронь</strong>.
      </p>}
      {outcome.kind==="SLOT_CONFLICT"&&<p>
        Слот уже занят. Вернитесь к свободному времени.
      </p>}
      {outcome.kind==="DENIED"&&<p>{denyMessage(outcome.status)}</p>}
      {outcome.kind==="UNKNOWN"&&<p>
        Результат неизвестен: ответ мог потеряться после сохранения.
        Повторная отправка запрещена; проверьте свои записи.
      </p>}
      {(outcome.kind==="UNKNOWN"||outcome.kind==="ACK_MOCK")&&<>
        <PrimaryButton type="button" disabled={readback!=="idle"}
          onClick={()=>void check()}>
          {readback==="loading"?"Проверяем…":"Проверить мои записи (макет)"}
        </PrimaryButton>
        {readback==="FOUND_MOCK"&&<p>
          Запись найдена только в синтетическом списке.
        </p>}
        {readback==="NOT_PROVEN"&&<p>
          Нет надёжного подтверждения в проверенных страницах макета.
          Это не доказывает отсутствие реальной записи.
        </p>}
      </>}
      <div className="consultation-mock-actions">
        <button type="button" className="button-secondary"
          onClick={onMyBookings}>К моим записям</button>
        <button type="button" className="button-secondary"
          onClick={onExit}>К слотам</button>
      </div>
    </div>}
  </section>;
}
