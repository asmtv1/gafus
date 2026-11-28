import {Platform} from "react-native";
import {getAndroidWalkStepSnapshot} from "./androidBackgroundSteps";
import {Pedometer} from "expo-sensors";

export type QaStepObservation =
  | {kind:"android-snapshot";requestedAt:number;receivedAt:number;steps:number;sensor:"counter"|"detector";running:boolean;incomplete:boolean;complete:false}
  | {kind:"ios-interval";from:number;to:number;requestedAt:number;receivedAt:number;delta:number;complete:false}
  | {kind:"unknown";reason:"unavailable"|"session"|"permission"|"timeout"|"invalid"};

/** Diagnostics only. Existing Android bridge has no sensor timestamp; never
 * assert an exact interval from request time. iOS reports historical interval
 * counts, but delivery completeness remains unverified until device QA. */
export async function sampleQaSteps(ownerId:string,walkId:string,from:number,to:number):Promise<QaStepObservation> {
  const requestedAt=Date.now();
  const read=async():Promise<QaStepObservation>=>{
    try {
      if(Platform.OS==="android") {
        const snapshot=await getAndroidWalkStepSnapshot();
        if(!snapshot||snapshot.ownerId!==ownerId||snapshot.walkId!==walkId) return {kind:"unknown",reason:"session"};
        if(snapshot.sensor!=="counter"&&snapshot.sensor!=="detector") return {kind:"unknown",reason:"unavailable"};
        if(!Number.isSafeInteger(snapshot.steps)||snapshot.steps<0) return {kind:"unknown",reason:"invalid"};
        return {kind:"android-snapshot",requestedAt,receivedAt:Date.now(),steps:snapshot.steps,sensor:snapshot.sensor,
          running:snapshot.running,incomplete:snapshot.incomplete,complete:false};
      }
      if(Platform.OS!=="ios"||!(await Pedometer.isAvailableAsync())) return {kind:"unknown",reason:"unavailable"};
      if(!(await Pedometer.getPermissionsAsync()).granted) return {kind:"unknown",reason:"permission"};
      if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to>requestedAt||to-from>300_000) return {kind:"unknown",reason:"invalid"};
      const result=await Pedometer.getStepCountAsync(new Date(from),new Date(to));
      if(!Number.isSafeInteger(result.steps)||result.steps<0) return {kind:"unknown",reason:"invalid"};
      return {kind:"ios-interval",from,to,requestedAt,receivedAt:Date.now(),delta:result.steps,complete:false};
    } catch { /* diagnostic: expected Unavailable QA sensor is explicitly unknown. */ return {kind:"unknown",reason:"unavailable"};}
  };
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([read(),new Promise<QaStepObservation>(resolve=>{
      timer=setTimeout(()=>resolve({kind:"unknown",reason:"timeout"}),1500);
    })]);
  } finally {if(timer) clearTimeout(timer);}
}
