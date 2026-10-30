import { Loading } from "../../shared/ui";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SurveyAnswerValue, SurveyComparisonDto } from "@gafus/types";
import type { TrainingStepPreview } from "./trainingDayApi";
import type { TrainingDaySummary } from "./trainingDaysApi";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { ApiError } from "../../shared/api/client";
import { PrimaryButton } from "../../shared/ui";
import { getSurveyScreeningResult } from "@gafus/types";
import {
  hasSurveyAnswer, initializeSurveyOccurrence, readSurveyComparison,
  readSurveyTemplate, submitSurveyVerified, validateSurveyAnswers,
  type SurveyRead, type SurveyAnswers,
} from "./trainingSurveyApi";
import "./TrainingLearnerExtras.css";
import "./TrainingSurveyStep.css";

type Props = {
  userId:string; courseType:string;day:TrainingDaySummary;step:TrainingStepPreview;
};
function answersEqual(a:SurveyAnswers,b:SurveyAnswers):boolean {
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length &&
    keys.every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));
}
function draftKey({userId,day,step}:Props):string {
  return ["gafus-refactor-survey-v1",userId,day.courseId,
    day.dayOnCourseId,step.id,step.order].map(encodeURIComponent).join(":");
}
function storedDraft(key:string):SurveyAnswers|null {
  try{
    const value:unknown=JSON.parse(sessionStorage.getItem(key)??"null");
    if(!value||typeof value!=="object"||Array.isArray(value))return null;
    const entries=Object.entries(value);
    if(entries.length>100||entries.some(([k,v])=>
      !/^[A-Za-z0-9_-]{1,128}$/.test(k)||
      !(v===null||typeof v==="boolean"||
        typeof v==="string"&&v.length<=10000||
        Array.isArray(v)&&v.length<=100&&v.every(x=>typeof x==="string"))))
      return null;
    return value as SurveyAnswers;
  }catch{return null;}
}
function storeDraft(key:string,value:SurveyAnswers){
  try{sessionStorage.setItem(key,JSON.stringify(value));}catch{/* restricted browser */}
}
function clearDraft(key:string){
  try{sessionStorage.removeItem(key);}catch{/* restricted browser */}
}
export function TrainingSurveyStep(props:Props){
  return <TrainingSurveyContent key={[
    props.userId,props.courseType,props.day.dayOnCourseId,
    props.step.order,props.step.id,
  ].join(":")} {...props}/>;
}
function TrainingSurveyContent({userId,courseType,day,step}:Props){
  const cache=useQueryClient();
  const [data,setData]=useState<SurveyRead|null>(null);
  const [comparison,setComparison]=useState<SurveyComparisonDto|null>(null);
  const [answers,setAnswers]=useState<SurveyAnswers>({});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const epoch=useRef(0);
  const active=useRef(true);
  const flight=useRef(false);
  const key=draftKey({userId,courseType,day,step});
  const stillOwner=useCallback(()=>active.current &&
    cache.getQueryData<{id:string}|null>(CURRENT_USER_QUERY_KEY)?.id===userId,
  [cache,userId]);
  useEffect(()=>{
    active.current=true;
    const unsubscribe=cache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length!==CURRENT_USER_QUERY_KEY.length||
        !event.query.queryKey.every((item:unknown,i:number)=>
          item===CURRENT_USER_QUERY_KEY[i]))return;
      // No old private survey result can be mounted after auth revision.
      epoch.current++;
      // React Query may notify during another component's render. Retire
      // private state on the next microtask, while epoch/current fences any
      // in-flight response immediately.
      queueMicrotask(()=>{
        if(!active.current)return;
        setData(null);setAnswers({});setComparison(null);
        setError("Сессия изменилась. Откройте шаг заново.");
      });
    });
    const generation=epoch;
    return ()=>{active.current=false;generation.current++;unsubscribe();};
  },[cache]);
  useEffect(()=>{
    if(!stillOwner()||!step.surveySlug||step.locked||step.type!=="SURVEY"){
      setLoading(false);return;
    }
    const generation=epoch.current;
    const slug=step.surveySlug;
    void(async()=>{
      try{
        const result=await readSurveyTemplate(slug,step.id,day.courseId);
        if(!active.current||generation!==epoch.current||!stillOwner())return;
        setData(result);
        setAnswers(result.response?.answers??storedDraft(key)??{});
        if(result.template.phase==="FINAL"){
          try{
            const cmp=await readSurveyComparison(day.courseId,result.template.familySlug);
            if(active.current&&generation===epoch.current&&stillOwner())setComparison(cmp);
          }catch{/* comparison is optional; never blocks survey form */}
        }
      }catch{
        if(active.current&&generation===epoch.current&&stillOwner())
          setError("Не удалось загрузить анкету. Проверьте доступ и повторите.");
      }finally{
        if(active.current&&generation===epoch.current&&stillOwner())setLoading(false);
      }
    })();
  },[cache,courseType,day.courseId,key,step.id,step.surveySlug,
    step.type,step.locked,stillOwner]);
  const template=data?.template;
  const canEdit=!!template && (!data?.response||data.response.canEdit);
  const missingRequired=template?.questions.filter(q=>
    q.required&&!hasSurveyAnswer(answers[q.id]))??[];
  const update=(id:string,value:SurveyAnswerValue)=>{
    setAnswers(prev=>{
      const next={...prev,[id]:value};
      if(template&&canEdit)storeDraft(key,next);
      return next;
    });
  };
  const refreshComparison=async(familySlug:string,generation:number)=>{
    try{
      const latest=await readSurveyComparison(day.courseId,familySlug);
      if(active.current&&generation===epoch.current&&stillOwner())
        setComparison(latest);
    }catch{/* Optional historical data must never invalidate a confirmed submission. */}
  };
  const recheck=async()=>{
    if(!step.surveySlug||flight.current||!stillOwner())return;
    flight.current=true;setSaving(true);setError("");
    const generation=epoch.current;
    try{
      const fresh=await readSurveyTemplate(step.surveySlug,step.id,day.courseId);
      if(!active.current||generation!==epoch.current||!stillOwner())return;
      setData(fresh);
      if(fresh.response){setAnswers(fresh.response.answers);clearDraft(key);}
      if(fresh.template.phase==="FINAL"){
        await refreshComparison(fresh.template.familySlug,generation);
        if(!active.current||generation!==epoch.current||!stillOwner())return;
      }
      setUncertain(false);
      setNotice("Текущее состояние анкеты подтверждено сервером.");
    }catch{
      if(active.current&&generation===epoch.current&&stillOwner())
        setError("Не удалось проверить результат. Повторная отправка заблокирована.");
    }finally{
      flight.current=false;
      if(active.current&&generation===epoch.current&&stillOwner())setSaving(false);
    }
  };
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!template||!step.surveySlug||!canEdit||!stillOwner()||
      flight.current||uncertain||!validateSurveyAnswers(template,answers))return;
    flight.current=true;setSaving(true);setError("");setNotice("");
    const generation=epoch.current;
    const snapshot={...answers};
    let attempted=false;
    try{
      const userStepId=await initializeSurveyOccurrence(
        courseType,day,step,stillOwner);
      if(generation!==epoch.current||!stillOwner())return;
      attempted=true;
      await submitSurveyVerified(step.surveySlug,day.courseId,step.id,userStepId,snapshot);
      if(generation!==epoch.current||!stillOwner())return;
      const verified=await readSurveyTemplate(step.surveySlug,step.id,day.courseId);
      if(generation!==epoch.current||!stillOwner())return;
      if(!verified.response||!answersEqual(verified.response.answers,snapshot))
        throw Error("SURVEY_WRITE_UNCONFIRMED");
      setData(verified);
      setAnswers(verified.response.answers);
      clearDraft(key);
      setUncertain(false);
      setNotice("Анкета сохранена и подтверждена сервером.");
      if(verified.template.phase==="FINAL"){
        await refreshComparison(verified.template.familySlug,generation);
        if(!active.current||generation!==epoch.current||!stillOwner())return;
      }
      await cache.invalidateQueries({queryKey:["training","day",userId,
        courseType,day.dayOnCourseId],refetchType:"active"});
      await cache.invalidateQueries({queryKey:["training","bound-progress",
        userId,courseType,day.dayOnCourseId],refetchType:"active"});
    }catch(error){
      if(generation===epoch.current&&stillOwner()){
        // Explicit 4xx denial is an authoritative non-commit. A timeout,
        // 5xx, network error, or malformed success ACK may have committed.
        const terminal=attempted&&error instanceof ApiError&&
          [400,401,402,403,423].includes(error.status);
        if(attempted&&!terminal)setUncertain(true);
        setError(terminal ? error.status===423
          ? "Срок редактирования анкеты истёк. Проверьте сохранённый ответ."
          : error.status===402
            ? "Для отправки анкеты нужна подписка или разрешённый доступ к шагу."
            : error.status===401
              ? "Сессия завершена. Авторизуйтесь снова."
              : "Анкета отклонена сервером. Проверьте ответы и доступ."
          : attempted
            ? "Результат отправки неизвестен. Проверьте анкету перед повтором."
            : "Состояние шага изменилось или недоступно. Повторите чтение.");
      }
    }finally{
      flight.current=false;
      if(generation===epoch.current&&stillOwner())setSaving(false);
    }
  };
  if(!stillOwner())return <p role="alert">Сессия изменилась. Откройте шаг заново.</p>;
  if(!step.surveySlug)return <p role="alert">Для этого шага не назначена анкета.</p>;
  if(loading)return <Loading message="Загрузка анкеты…" />;
  if(!data)return <section aria-label="Анкета">
    <p role="alert">{error||"Анкета недоступна"}</p>
    <button type="button" className="button-secondary"
      onClick={()=>void recheck()}>Проверить анкету</button>
  </section>;
  return <form className="training-exam training-survey" aria-label="Анкета"
    onSubmit={event=>void submit(event)}>
    <header className="training-survey-header">
      <span className="training-survey-eyebrow">Анкета</span>
      <h5>{template?.title}</h5>
      {template?.description&&<p>{template.description}</p>}
    </header>
    {data.response&&<p className="training-survey-status" role="status">
      Ответ отправлен {new Date(data.response.submittedAt).toLocaleString("ru-RU")}.
      {" "}{data.response.canEdit
        ? "Редактирование доступно до "+new Date(data.response.editableUntil)
          .toLocaleString("ru-RU")+"."
        : "Редактирование закрыто."}
    </p>}
    {data.response&&getSurveyScreeningResult(step.surveySlug,data.response.answers)&&
      <section className="training-survey-result" aria-label="Результат анкеты">
        <h6>Результат анкеты</h6>
        <p>{getSurveyScreeningResult(step.surveySlug,data.response.answers)}</p>
      </section>}
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {uncertain&&<p role="alert">Повторная отправка заблокирована до проверки.</p>}
    {template?.sections.map(section=>{
      const questions=template.questions.filter(q=>q.sectionId===section.id);
      if(!questions.length)return null;
      return <fieldset key={section.id} className="training-survey-section">
        <legend>{section.title}</legend>
        <div className="training-survey-question-list">
          {questions.map(q=><fieldset key={q.id} className="training-survey-question">
            <legend className="training-survey-question-title">
              {q.title}{q.required&&<span aria-label="обязательно" className="training-survey-required"> *</span>}
            </legend>
            {q.description&&<p className="training-survey-question-description">{q.description}</p>}
            {["text","petSelect"].includes(q.type)&&<input className="training-survey-text-field"
              type="text" id={"survey-"+step.id+"-"+q.id} aria-label={q.title}
              value={typeof answers[q.id]==="string"?answers[q.id] as string:""}
              placeholder={q.placeholder} disabled={!canEdit||saving||uncertain}
              onChange={event=>update(q.id,event.target.value)}/>}
            {q.type==="textarea"&&<textarea className="training-survey-text-field"
              id={"survey-"+step.id+"-"+q.id} aria-label={q.title}
              rows={4} maxLength={10000}
              value={typeof answers[q.id]==="string"?answers[q.id] as string:""}
              placeholder={q.placeholder} disabled={!canEdit||saving||uncertain}
              onChange={event=>update(q.id,event.target.value)}/>}
            {["singleChoice","multiChoice"].includes(q.type)&&
              <div className="training-survey-choices">
                {q.options?.map(o=><label key={o.value} className="training-survey-choice">
                  <input type={q.type==="singleChoice"?"radio":"checkbox"}
                    name={"survey-"+step.id+"-"+q.id}
                    checked={q.type==="singleChoice"?answers[q.id]===o.value:
                      Array.isArray(answers[q.id])&&(answers[q.id] as string[]).includes(o.value)}
                    disabled={!canEdit||saving||uncertain}
                    onChange={()=>{
                      if(q.type==="singleChoice"){update(q.id,o.value);return;}
                      const current=Array.isArray(answers[q.id])?answers[q.id] as string[]:[];
                      update(q.id,current.includes(o.value)?
                        current.filter(v=>v!==o.value):[...current,o.value]);
                    }}/>
                  <span>{o.label}</span>
                </label>)}
              </div>}
            {q.type==="boolean"&&<div className="training-survey-choices">
              <label className="training-survey-choice">
                <input type="checkbox" checked={answers[q.id]===true}
                  disabled={!canEdit||saving||uncertain}
                  onChange={event=>update(q.id,event.target.checked)}/>
                <span>Да</span>
              </label>
            </div>}
          </fieldset>)}
        </div>
      </fieldset>;
    })}
    {comparison&&<section><h6>Динамика до и после</h6>
      {comparison.items.filter(item=>item.changed).slice(0,8).map(item=><p key={item.questionId}>
        <strong>{item.label??item.questionId}:</strong> {JSON.stringify(item.before)}
        {" → "}{JSON.stringify(item.after)}
      </p>)}
    </section>}
    {missingRequired.length>0&&<p role="status">
      Заполните обязательные поля: {missingRequired.length}
    </p>}
    <div className="training-survey-actions">
      {canEdit&&<PrimaryButton type="submit"
        disabled={saving||uncertain||!validateSurveyAnswers(template!,answers)}>
        {saving?"Сохранение…":"Отправить анкету"}
      </PrimaryButton>}
      <button className="button-secondary training-survey-refresh" type="button"
        disabled={saving} onClick={()=>void recheck()}>Проверить сохранение</button>
    </div>
  </form>;
}
