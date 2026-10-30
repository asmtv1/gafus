import {useState} from "react";
import type {PetWeightHistoryRead} from "./petApi";
import styles from "./PetWeightChart.module.css";

type WeightPeriod="3m"|"1y"|"all";
const formatWeight=(value:number)=>new Intl.NumberFormat("ru-RU",{
  maximumFractionDigits:2,
}).format(value);
const formatDate=(value:string)=>new Intl.DateTimeFormat("ru-RU",{
  day:"numeric",month:"long",year:"numeric",timeZone:"UTC",
}).format(new Date(value));
const formatMonth=(value:string)=>new Intl.DateTimeFormat("ru-RU",{
  month:"short",year:"numeric",timeZone:"UTC",
}).format(new Date(value));

/** Source Next PetWeight SVG geometry, driven solely by authenticated Hono
 * history projection. Period choice never changes the underlying persisted data. */
export function PetWeightChart({data,now=new Date()}:{
  data:PetWeightHistoryRead;now?:Date;
}){
  const [period,setPeriod]=useState<WeightPeriod>("1y");
  const cutoff=new Date(now);
  cutoff.setMonth(cutoff.getMonth()-(period==="3m"?3:12));
  const visible=period==="all"?data.entries:
    data.entries.filter(entry=>new Date(entry.measuredAt)>=cutoff);
  const latest=data.entries.at(-1);
  const first=visible[0],last=visible.at(-1);
  const values=visible.map(entry=>entry.weightKg);
  if(data.targetWeightKg!==null)values.push(data.targetWeightKg);
  const min=values.length?Math.min(...values):0;
  const max=values.length?Math.max(...values):1;
  const padding=Math.max((max-min)*0.2,0.5);
  const lo=min-padding,hi=max+padding;
  const x=(entry:typeof first)=>first&&last&&first!==last&&entry?
    22+((new Date(entry.measuredAt).getTime()-new Date(first.measuredAt).getTime())/
      Math.max(1,new Date(last.measuredAt).getTime()-new Date(first.measuredAt).getTime()))*456:250;
  const y=(value:number)=>178-((value-lo)/(hi-lo))*150;
  return <div className={styles.section} aria-label="График веса питомца">
    <div className={styles.periods} aria-label="Период графика">
      {([ ["3m","3 месяца"],["1y","Год"],["all","Всё"] ] as const).map(([id,label])=>
        <button type="button" key={id} aria-pressed={period===id}
          onClick={()=>setPeriod(id)}>{label}</button>)}
    </div>
    {visible.length?<div className={styles.chart}>
      <svg viewBox="0 0 500 200" role="img"
        aria-label={`График веса: ${visible.length} измерений`} preserveAspectRatio="none">
        {data.targetWeightKg!==null&&<>
          <line x1="22" x2="478" y1={y(data.targetWeightKg)} y2={y(data.targetWeightKg)}
            className={styles.goalLine}/>
          <text x="26" y={Math.max(16,y(data.targetWeightKg)-8)}
            className={styles.goalLabel}>Цель {formatWeight(data.targetWeightKg)} кг</text>
        </>}
        <line x1="22" x2="478" y1="180" y2="180" className={styles.axis}/>
        {visible.length>1&&<polyline className={styles.line}
          points={visible.map(entry=>`${x(entry)},${y(entry.weightKg)}`).join(" ")}/>}
        {visible.map((entry,index)=><circle key={entry.id} cx={x(entry)}
          cy={y(entry.weightKg)} r={index===visible.length-1?6:4}
          className={index===visible.length-1?styles.lastPoint:styles.point}>
          <title>{formatDate(entry.measuredAt)}: {formatWeight(entry.weightKg)} кг</title>
        </circle>)}
      </svg>
      <div className={styles.axisLabels}><span>{first&&formatMonth(first.measuredAt)}</span>
        <span>{last&&formatMonth(last.measuredAt)}</span></div>
    </div>:<p className={styles.hint}>
      За этот период измерений нет. Запишите вес, чтобы увидеть изменение.
    </p>}
    {data.targetWeightKg!==null&&latest&&<p className={styles.summary}>
      {latest.weightKg===data.targetWeightKg?"Целевой вес достигнут":
        `До цели ${formatWeight(Math.abs(latest.weightKg-data.targetWeightKg))} кг · ${
          latest.weightKg>data.targetWeightKg?"снижение":"набор"} веса`}
    </p>}
  </div>;
}
