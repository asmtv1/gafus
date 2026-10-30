import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./TrainingStepImage.css";

/** Next ImageViewer parity for unlocked day-step illustrations.
 * No second fetch or signed-URL persistence. Source media already passed the
 * owner-scoped day projection; locked images never reach this component. */
export function TrainingStepImage({src,alt,priority=false}:{
  src:string;alt:string;priority?:boolean;
}) {
  const [open,setOpen]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const previous=document.body.style.overflow;
    const returnFocus=trigger.current;
    document.body.style.overflow="hidden";
    closeRef.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setOpen(false);}
      if(event.key==="Tab"&&event.shiftKey&&
          document.activeElement===closeRef.current){
        event.preventDefault();closeRef.current?.focus();
      }
      if(event.key==="Tab"&&!event.shiftKey&&
          document.activeElement===closeRef.current){
        event.preventDefault();closeRef.current?.focus();
      }
    };
    window.addEventListener("keydown",key);
    return ()=>{
      document.body.style.overflow=previous;
      window.removeEventListener("keydown",key);
      returnFocus?.focus();
    };
  },[open]);
  return <>
    <button type="button" className="training-step-image-thumb"
      ref={trigger} aria-label={"Открыть изображение: "+alt}
      onClick={()=>setOpen(true)}>
      <img src={src} alt={alt} loading={priority?"eager":"lazy"}/>
      <span className="training-step-image-zoom" aria-hidden="true">＋</span>
    </button>
    {open&&createPortal(
      <div role="dialog" aria-modal="true" tabIndex={-1}
        aria-label={"Просмотр изображения: "+alt}
        className="training-step-image-backdrop"
        onMouseDown={event=>{
          if(event.currentTarget===event.target)setOpen(false);
        }}>
        <div className="training-step-image-dialog">
          <button type="button" ref={closeRef}
            className="training-step-image-close"
            aria-label="Закрыть изображение" onClick={()=>setOpen(false)}>×</button>
          <img src={src} alt={alt} className="training-step-image-full"/>
          <p className="training-step-image-caption">{alt}</p>
        </div>
      </div>,document.body)}
  </>;
}
