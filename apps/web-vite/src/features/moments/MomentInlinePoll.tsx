import { useEffect, useRef, useState } from "react";
import {
  FEED_PHOTO_MIME_TYPES, type FeedPollEditorDraft,
  validateFeedPollDraft,
} from "@gafus/types";
import { validateMomentPhoto } from "./feedMediaTransfer";
import {CaramelButton, SecondaryButton} from "../../shared/ui";

export type MomentPollImageAsset = {
  file: File; requestId: string; bytes: number; previewUri: string;
};
export type MomentInlinePollDraft = FeedPollEditorDraft<MomentPollImageAsset>;


export function emptyMomentInlinePoll(): MomentInlinePollDraft {
  return { question:"", options:[{text:""},{text:""}], isQuiz:false,
    allowMultiple:false, isAnonymous:false, hideResults:false,
    shuffleOptions:false, endDate:null, explanation:null };
}

/** Original Next composition controls. Core remains sole poll validation/mutation. */
export function MomentInlinePoll({value,onChange,disabled}: {
  value:MomentInlinePollDraft | null;
  onChange:(poll:MomentInlinePollDraft | null)=>void;
  disabled:boolean;
}) {
  const [photoError, setPhotoError] = useState("");
  const liveOptions = useRef(value?.options);
  liveOptions.current = value?.options;
  useEffect(() => () => {
    for (const option of liveOptions.current ?? []) {
      if (option.imageAsset?.previewUri.startsWith("blob:"))
        URL.revokeObjectURL(option.imageAsset.previewUri);
    }
  }, []);
  const release = (option: MomentInlinePollDraft["options"][number]) => {
    if (option.imageAsset?.previewUri.startsWith("blob:"))
      URL.revokeObjectURL(option.imageAsset.previewUri);
  };
  const selectImage = (index: number, file: File | undefined) => {
    if (!file || disabled || !value) return;
    try {
      validateMomentPhoto(file, index);
      if (!(FEED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type))
        throw new Error("PHOTO_MIME_DENIED");
      const old = value.options[index];
      if (!old) return;
      const previewUri = URL.createObjectURL(file);
      release(old);
      setPhotoError("");
      onChange({ ...value, options: value.options.map((item, i) => i === index
        ? { ...item, imageAsset: { file, bytes: file.size,
          requestId: crypto.randomUUID(), previewUri } } : item) });
    } catch {
      setPhotoError("Фото должно быть JPG, PNG или WebP размером до 10 МиБ.");
    }
  };
  if(!value)return <CaramelButton type="button" disabled={disabled}
    onClick={()=>onChange(emptyMomentInlinePoll())}>+ Добавить опрос</CaramelButton>;
  const change=(next:Partial<MomentInlinePollDraft>)=>onChange({...value,...next});
  const changeOption=(index:number, patch:Partial<MomentInlinePollDraft["options"][number]>)=>
    change({options:value.options.map((option,i)=>i===index?{...option,...patch}:option)});
  const issue=validateFeedPollDraft(value);
  return <section className="web4-inline-poll" aria-label="Редактор опроса">
    <header><div><strong>Опрос</strong>
      <p>Узнайте мнение других владельцев питомцев</p></div>
      <SecondaryButton variant="red" className="gafus-inline-red-action" type="button" disabled={disabled} onClick={()=>{
        value.options.forEach(release); setPhotoError(""); onChange(null);
      }}>Убрать</SecondaryButton>
    </header>
    <label>Вопрос
      <input value={value.question} disabled={disabled} maxLength={500}
        placeholder="Что вы думаете?" onChange={e=>change({question:e.target.value})}/>
    </label>
    <div className="web4-inline-poll-options">
      {value.options.map((option,i)=><div key={i}>
        {value.isQuiz && <label>
          <input type={value.allowMultiple?"checkbox":"radio"} name="web4-poll-correct"
            aria-label={`Правильный вариант ${i+1}`} disabled={disabled}
            checked={!!option.isCorrect} onChange={e=>change({options:value.options.map((item,j)=>({
              ...item,isCorrect:value.allowMultiple?(j===i?e.target.checked:!!item.isCorrect):j===i,
            }))})}/> Правильный
        </label>}
        <input aria-label={`Вариант ответа ${i+1}`} disabled={disabled}
          maxLength={200} placeholder={`Вариант ${i+1}`}
          value={option.text} onChange={e=>changeOption(i,{text:e.target.value})}/>
        {value.options.length>2 && <SecondaryButton variant="red" className="gafus-inline-red-icon-sm" disabled={disabled}
          aria-label={`Удалить вариант ${i+1}`}
          onClick={()=>{
            release(option); change({options:value.options.filter((_,j)=>i!==j)});
          }}>×</SecondaryButton>}
        <label className="web4-inline-poll-photo-picker">
          {option.imageAsset ? "Заменить фото" : "+ Фото"}
          <input type="file" disabled={disabled}
            accept="image/jpeg,image/png,image/webp"
            aria-label={`Фото варианта ${i+1}`}
            onChange={e=>{ selectImage(i,e.currentTarget.files?.[0]); e.currentTarget.value=""; }}/>
        </label>
        {option.imageAsset && <div className="web4-inline-poll-photo-preview">
          <img src={option.imageAsset.previewUri}
            alt={`Фото варианта ${i+1}`}/>
          <SecondaryButton variant="red" className="gafus-inline-red-icon-sm" disabled={disabled}
            aria-label={`Убрать фото варианта ${i+1}`}
            onClick={()=>{
              release(option);
              changeOption(i,{imageAsset:undefined});
            }}>×</SecondaryButton>
        </div>}
      </div>)}
      {value.options.length<10 && <button type="button" disabled={disabled}
        onClick={()=>change({options:[...value.options,{text:""}]})}>+ Вариант ответа</button>}
    </div>
    <div className="web4-inline-poll-settings">
      {([
        ["allowMultiple","Несколько вариантов"],
        ["isQuiz","Викторина с правильным ответом"],
        ["isAnonymous","Анонимное голосование"],
        ["hideResults","Скрывать результаты до завершения"],
        ["shuffleOptions","Перемешивать варианты"],
      ] as const).map(([key,label])=><label key={key}>
        <input type="checkbox" disabled={disabled} checked={!!value[key]}
          onChange={e=>{
            const next:Partial<MomentInlinePollDraft>={[key]:e.target.checked};
            if(key==="isQuiz" && !e.target.checked)
              next.options=value.options.map(item=>({...item,isCorrect:false}));
            if(key==="allowMultiple" && !e.target.checked){
              const first=value.options.findIndex(item=>item.isCorrect);
              next.options=value.options.map((item,i)=>({...item,isCorrect:i===first}));
            }
            change(next);
          }}/>{label}
      </label>)}
    </div>
    <label>Завершить опрос (необязательно)
      <input type="datetime-local" disabled={disabled}
        value={value.endDate?new Date(Date.parse(value.endDate)-new Date(value.endDate).getTimezoneOffset()*60000).toISOString().slice(0,16):""}
        onChange={e=>change({endDate:e.target.value?new Date(e.target.value).toISOString():null})}/>
    </label>
    {value.isQuiz && <label>Пояснение правильного ответа
      <textarea value={value.explanation??""} disabled={disabled} maxLength={2000}
        onChange={e=>change({explanation:e.target.value})}/>
    </label>}
    {photoError && <p role="alert">{photoError}</p>}
    {issue && <p role="status">{issue}</p>}
  </section>;
}
