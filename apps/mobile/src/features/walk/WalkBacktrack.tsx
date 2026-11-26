import {useEffect,useMemo,useRef,useState} from "react";
import {Pressable,StyleSheet,View} from "react-native";
import {Text} from "react-native-paper";
import Svg,{Circle,Polyline} from "react-native-svg";
import {
  createBacktrackPlan,initialBacktrackProgress,advanceBacktrack,backtrackOfflineLine,displayFixStatus,
  type BacktrackPlan,type BacktrackProgress,type BacktrackResult,type DisplayFix,type BacktrackPoint,
} from "@gafus/core-client/walk-tracking";

export function WalkBacktrack({points,position,now}:{points:readonly BacktrackPoint[];position:DisplayFix|null;now:number}) {
  const [plan,setPlan]=useState<BacktrackPlan|null>(null);
  const [result,setResult]=useState<BacktrackResult|null>(null);
  const progress=useRef<BacktrackProgress>(initialBacktrackProgress());
  const lastEvaluated=useRef(0);
  const display=displayFixStatus(position,now);
  const start=()=>{
    const next=createBacktrackPlan(points);
    if(!next||next.vertices.length<2) return;
    progress.current=initialBacktrackProgress();lastEvaluated.current=0;
    setResult(null);setPlan(next);
  };
  useEffect(()=>{
    if(!plan||!position||position.timestamp===lastEvaluated.current) return;
    lastEvaluated.current=position.timestamp;
    const next=advanceBacktrack(plan,progress.current,position,now);
    progress.current=next.progress;
    setResult(next);
  },[plan,position,now]);
  const line=useMemo(()=>plan?backtrackOfflineLine(plan):null,[plan]);
  if(!plan||!line) return <Pressable accessibilityRole="button" disabled={points.length<2} onPress={start} style={styles.button}>
    <Text style={styles.action}>Вернуться по своему следу</Text>
  </Pressable>;
  const current=position&&line.project(position);
  const target=result?.next?line.project({...result.next,timestamp:now,accuracy:null}):null;
  const status=!display||display.stale?"Нет свежего GPS":
    result?.status==="ambiguous"?"Неоднозначное положение на следе. Уточняем GPS.":
    result?.status==="off-route"?"Вы вне записанного участка. Вернитесь к линии.":
    result?.status==="gap"?"Дальше часть пути не записана. Навигация по разрыву невозможна.":
    result?.status==="arrived"?"Начало записанного маршрута достигнуто.":
    result?.status==="stale"?"Уточняем позицию":"Следуйте к следующей отмеченной точке.";
  return <View style={styles.panel}>
    <Text variant="titleSmall">Возврат по записанному следу</Text>
    <Svg width="100%" height={180} viewBox="0 0 300 180">
      <Polyline points={line.points} stroke="#557645" strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round"/>
      {target?<Circle cx={target[0]} cy={target[1]} r={5} fill="#C27722"/>:null}
      {current?<Circle cx={current[0]} cy={current[1]} r={6} fill={display?.stale?"#999":"#2869C5"}/>:null}
    </Svg>
    <Text variant="bodyMedium">До начала непрерывного участка: {Math.round(result?.remainingMeters??plan.meters)} м</Text>
    <Text variant="bodySmall">{status}</Text>
    {plan.hasEarlierSegments?<Text variant="bodySmall">Есть более ранние участки за разрывом. Они не входят в остаток.</Text>:null}
    <Text variant="bodySmall">Схема работает без карты и интернета. Проходимость и безопасность пути не проверяются.</Text>
    <Pressable accessibilityRole="button" onPress={()=>{setPlan(null);setResult(null);}} style={styles.button}><Text style={styles.action}>Завершить возврат</Text></Pressable>
  </View>;
}
const styles=StyleSheet.create({panel:{gap:8,padding:10,borderRadius:10,backgroundColor:"#FFF"},button:{paddingVertical:10},action:{color:"#42653C",fontWeight:"600"}});
