import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {apiRequest,ApiError} from "../../shared/api/client";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {navigate,routeForPath,useRoutePath} from "../../shared/router/location";
import {getWebOnboardingTourSteps} from "./NextTourSteps";
import source from "../../brand/LegacyTourOverlay.module.css";
import "./web1-tour-buttons.css";
import {PrimaryButton,SecondaryButton} from "../../shared/ui";

const RESTART_TOUR_EVENT="gafus:restart-owner-tour";
export function restartProfileTour(ownerId:string){
  if(typeof window!=="undefined")
    window.dispatchEvent(new CustomEvent(RESTART_TOUR_EVENT,{detail:{ownerId}}));
}

const TARGET_WAIT_TIMEOUT_MS=1600;
const CONSULTATIONS_TARGET_TOP=245;
const TOP_CARD_TARGET_TOP=230;
const COURSES_TARGET_TOP=180;

function comfortablyVisible(rect:DOMRect){
  const margin=12;
  if(rect.height>=window.innerHeight-margin*2)
    return rect.top>=margin&&rect.top<=Math.round(window.innerHeight*.35);
  return rect.top>=margin&&rect.bottom<=window.innerHeight-margin;
}
function alignTopTarget(el:Element,desiredTop:number){
  const delta=el.getBoundingClientRect().top-desiredTop;
  if(Math.abs(delta)>=10)
    window.scrollTo({top:Math.max(0,window.scrollY+delta),behavior:"auto"});
}
function alignCoursesTarget(el:Element){
  const rect=el.getBoundingClientRect();
  if(Math.abs(rect.top-COURSES_TARGET_TOP)<8)return;
  const targetTop=Math.max(0,Math.round(window.scrollY+rect.top-COURSES_TARGET_TOP));
  window.scrollTo({top:targetTop,behavior:"auto"});
  document.documentElement.scrollTop=targetTop;
  document.body.scrollTop=targetTop;
  document.scrollingElement?.scrollTo?.({top:targetTop,behavior:"auto"});
}

const selectors:Record<string,string>={
  "consultations-first-card":".next-cynologist-catalog [class*='card']",
  "tab-pets":"a[href='/pets']",
  "pets-add-button":"a[href='/profile/addPet']",
  "pet-prevention-section":"[data-next-pet-prevention]",
  "pet-documents-section":"[data-next-pet-documents]",
  "daily-course-card":"[data-next-daily-course-card]",
  "courses-first-card":"[data-next-course-search]",
};
/** Reruns the retained Next 9-step tour against real Vite route navigation.
 * Only completion/skip persists to the registered Hono completion route.
 * It never creates pets, books services or writes profile data itself.
 */
export function NextTourHost({ownerId}:{ownerId:string|null}){
  const cache=useQueryClient();
  const pathname=useRoutePath();
  const [active,setActive]=useState(false);
  const [index,setIndex]=useState(0);
  const [hasPets,setHasPets]=useState(false);
  const [pending,setPending]=useState(false);
  const [awaitingPetCreation,setAwaitingPetCreation]=useState(false);
  const [message,setMessage]=useState("");
  const [target,setTarget]=useState<DOMRect|null>(null);
  const [unknown,setUnknown]=useState(false);
  const manuallyStarted=useRef(false);
  const courseAligned=useRef(false);
  const steps=useMemo(()=>getWebOnboardingTourSteps({hasPets}),[hasPets]);
  const step=steps[index];
  const owns=useCallback(()=>{
    const user=cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY);
    return Boolean(ownerId&&user?.id===ownerId);
  },[cache,ownerId]);
  useEffect(()=>{
    function begin(event:Event){
      const incoming=(event as CustomEvent<{ownerId:string}>).detail;
      if(!incoming||incoming.ownerId!==ownerId||!owns())return;
      setHasPets(false);setIndex(0);setUnknown(false);setMessage("");setPending(false);
      setAwaitingPetCreation(false);
      manuallyStarted.current=true;
      setActive(true);
      // A read is useful but nonessential. It must not trigger any pet mutation.
      void apiRequest<unknown>("/api/v1/pets",{method:"GET",browserAuth:true})
        .then(data=>{if(owns()&&Array.isArray(data))setHasPets(data.length>0);})
        .catch(()=>undefined);
    }
    window.addEventListener(RESTART_TOUR_EVENT,begin);
    return()=>window.removeEventListener(RESTART_TOUR_EVENT,begin);
  },[ownerId,cache,owns]);
  useEffect(()=>{
    if(!ownerId){
      setActive(false);setIndex(0);setAwaitingPetCreation(false);
      manuallyStarted.current=false;
    }
  },[ownerId]);
  // Next autostarts the tour 500ms after an authenticated first visit.
  // A genuine self-only GET must confirm hasSeenV1=false; failures, malformed
  // responses and another account's late ACK must NEVER open an overlay.
  useEffect(()=>{
    if(!ownerId||!owns())return;
    let disposed=false;
    let timer:number|undefined;
    void apiRequest<{hasSeenV1:boolean}>("/api/v1/user/onboarding-tour",{
      method:"GET",browserAuth:true,
    }).then(result=>{
      if(disposed||!owns()||manuallyStarted.current||
        typeof result?.hasSeenV1!=="boolean"||result.hasSeenV1)return;
      timer=window.setTimeout(()=>{
        if(disposed||!owns()||manuallyStarted.current)return;
        setIndex(0);setActive(previous=>previous||true);
      },500);
    }).catch(()=>undefined);
    return()=>{disposed=true;if(timer!==undefined)window.clearTimeout(timer);};
  },[ownerId,owns]);
  // In the retained Next onboarding tour, the Add Pet step genuinely opens
  // the owner form and waits for a new pet before continuing to Prevention.
  useEffect(()=>{
    if(!awaitingPetCreation||!owns()||pathname!=="/pets")return;
    let cancelled=false;
    void apiRequest<unknown>("/api/v1/pets",{method:"GET",browserAuth:true})
      .then(data=>{
        if(cancelled||!owns())return;
        if(Array.isArray(data)&&data.length>0){
          setHasPets(true);setIndex(4);setAwaitingPetCreation(false);
        }else{
          setAwaitingPetCreation(false);setActive(false);
        }
      }).catch(()=>{
        if(!cancelled){setAwaitingPetCreation(false);setActive(false);}
      });
    return()=>{cancelled=true;};
  },[awaitingPetCreation,pathname,owns]);
  useEffect(()=>{
    courseAligned.current=false;
  },[index,pathname]);
  useEffect(()=>{
    if(!active||!step?.targetId){setTarget(null);return;}
    let disposed=false;
    let timeoutId:number|undefined;
    const started=Date.now();
    let lastRect:DOMRect|null=null;
    const targetId=step.targetId;
    const tick=()=>{
      if(disposed||!owns())return;
      const selector=selectors[targetId];
      const element=selector?document.querySelector(selector):null;
      if(element){
        const before=element.getBoundingClientRect();
        if(before.width>0&&before.height>0){
          if(step.id==="courses"){
            // The original Next aligns step 8 only once; repeated scrolls
            // make its highlight and the underlying catalog jump.
            if(!courseAligned.current){
              alignCoursesTarget(element);
              courseAligned.current=true;
            }
          }else if(step.cardPlacement==="above"){
            alignTopTarget(element,step.id==="consultations"?
              CONSULTATIONS_TARGET_TOP:TOP_CARD_TARGET_TOP);
          }else if(!comfortablyVisible(before)){
            element.scrollIntoView?.({behavior:"auto",
              block:before.height>=window.innerHeight-24?"start":"center",
              inline:"nearest"});
          }
          const measured=element.getBoundingClientRect();
          lastRect=measured;setTarget(measured);
          if(step.id==="courses"||comfortablyVisible(measured))return;
        }
      }
      if(Date.now()-started>=TARGET_WAIT_TIMEOUT_MS){
        setTarget(lastRect);return;
      }
      timeoutId=window.setTimeout(tick,16);
    };
    setTarget(null);
    tick();
    const resize=()=>{
      const el=document.querySelector(selectors[targetId]);
      if(el)setTarget(el.getBoundingClientRect());
    };
    window.addEventListener("resize",resize);
    return()=>{
      disposed=true;
      if(timeoutId!==undefined)window.clearTimeout(timeoutId);
      window.removeEventListener("resize",resize);
    };
  },[active,index,step?.id,step?.targetId,step?.cardPlacement,pathname,owns]);
  if(!active||!ownerId||!owns()||!step||awaitingPetCreation)return null;
  const last=index===steps.length-1;
  function go(next:number){
    if(step?.requiresPetCreation&&!hasPets){
      setAwaitingPetCreation(true);
      navigate("/profile/addPet");
      return;
    }
    const nextStep=steps[next];
    if(!nextStep)return;
    setIndex(next);setTarget(null);setMessage("");
    if(nextStep.route){
      const route=routeForPath(nextStep.route);
      if(route)navigate(route);
    }
  }
  async function finish(){
    if(!owns()||pending||unknown)return;
    setPending(true);setMessage("");
    try{
      await apiRequest("/api/v1/user/onboarding-tour/complete",{
        method:"POST",browserAuth:true,expectedStatus:200,
      });
      if(!owns())return;
      setActive(false);setIndex(0);setTarget(null);
      navigate("/profile");
    }catch(err){
      if(!owns())return;
      if(err instanceof ApiError&&[400,401,403,409].includes(err.status))
        setMessage(err.message);
      else{setUnknown(true);setMessage("Не удалось подтвердить сохранение результата экскурсии. Повтор запроса заблокирован.");}
    }finally{setPending(false);}
  }
  // Original Next TourOverlay computes card placement from the actual
  // measured target, not a fixed 30vh guess. Mirror its math exactly.
  const margin=12;
  const estimatedCardHeight=260;
  const cardAnchor=step.cardAnchor;
  let cardTop:number;
  if(cardAnchor==="center")cardTop=Math.max(margin,(window.innerHeight-estimatedCardHeight)/2);
  else if(cardAnchor==="viewport")cardTop=Math.max(margin,
    window.innerHeight-estimatedCardHeight-margin);
  else if(!target)cardTop=step.cardPlacement==="above" ? margin :
    Math.max(margin,Math.round(window.innerHeight*.3));
  else{
    const above=target.top-estimatedCardHeight-12;
    const below=target.bottom+12;
    const maxTop=window.innerHeight-estimatedCardHeight-margin;
    cardTop=step.cardPlacement==="above"?margin:below;
    if(step.cardPlacement!=="above"&&below>maxTop)
      cardTop=above>=margin?above:maxTop;
    cardTop=Math.max(margin,cardTop);
  }
  return <div className={source.root} data-next-onboarding-tour>
    <div className={target?source.backdropTransparent:source.backdrop}/>
    {target&&<div className={source.highlight} aria-hidden="true" style={{
      left:Math.max(8,target.x-8),top:Math.max(8,target.y-8),
      width:target.width+16,height:target.height+16,
    }}/>}
    <section className={source.card} role="dialog" aria-modal="true"
      aria-label="Экскурсия по GAFUS" style={{
        left:"max(12px, calc((100vw - min(560px, 100vw - 24px)) / 2))",
        top:`${cardTop}px`,
      }}>
      <div className={source.counter}>{index+1}/{steps.length}</div>
      <div className={source.title} role="heading" aria-level={2}>{step.title}</div>
      <div className={source.text}>{step.text}</div>
      {message&&<p role="alert">{message}</p>}
      <div className={source.actions}>
        {!last&&(step.allowSkip??true)&&
          <SecondaryButton className={source.skip} data-web1-tour-secondary
          disabled={pending||unknown}
          onClick={()=>void finish()}>Пропустить</SecondaryButton>}
        <PrimaryButton className={source.next} data-web1-tour-primary
          disabled={pending||unknown}
          onClick={()=>last?void finish():go(index+1)}>
          {pending?"Сохраняем…":step.primaryActionLabel??(last?"Готово":"Далее")}
        </PrimaryButton>
      </div>
    </section>
  </div>;
}
