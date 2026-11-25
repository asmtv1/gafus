import { useEffect,useState } from "react";
import { Alert,AppState,Pressable,Share,StyleSheet,View } from "react-native";
import { Text } from "react-native-paper";
import { useAuthStore } from "@/shared/stores/authStore";
import { deleteWalkQaCapture,exportWalkQaCapture,getWalkQaCapture,walkQaEnabled } from "./walkGpsStorage";

export function WalkQaControls({ownerId,active,armed,onArmChange,busy}:{ownerId:string;active:boolean;armed:boolean;onArmChange:(value:boolean)=>void;busy:boolean}) {
  const [capture,setCapture]=useState<Awaited<ReturnType<typeof getWalkQaCapture>>>(null);
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const epoch=useAuthStore(s=>s.verifiedSessionEpoch);
  const isCurrent=()=>{
    const auth=useAuthStore.getState();
    return auth.isAuthenticated&&!auth.isLoading&&auth.user?.id===ownerId&&auth.verifiedSessionEpoch===epoch;
  };
  useEffect(()=>{
    if(!walkQaEnabled()) return;
    let disposed=false;
    const refresh=async()=>{
      try {
        const row=await getWalkQaCapture(ownerId);
        if(!disposed&&AppState.currentState==="active") setCapture(row);
      } catch { if(!disposed) setMessage("Не удалось прочитать состояние QA-записи."); }
    };
    void refresh();
    const timer=setInterval(()=>{if(AppState.currentState==="active") void refresh();},5000);
    return ()=>{disposed=true;clearInterval(timer);};
  },[ownerId,active]);
  if(!walkQaEnabled()) return null;
  const exportCapture=()=>{
    if(!capture||!isCurrent()) return;
    const id=capture.walkId;
    Alert.alert("Экспорт QA-записи","Файл содержит точные координаты и время прогулки. Получатель сможет увидеть ваш маршрут. Отправляйте только согласованному QA.",[
      {text:"Отмена",style:"cancel"},
      {text:"Экспортировать",onPress:()=>void(async()=>{
        setWorking(true);
        try {
          const data=await exportWalkQaCapture(ownerId,id,isCurrent);
          if(isCurrent()) await Share.share({message:data,title:"GAFUS QA — приватная запись"});
        } catch {setMessage("Экспорт недоступен: запись удалена, истекла или шифрование не поддерживается.");}
        finally{setWorking(false);}
      })()},
    ]);
  };
  return <View style={styles.panel}>
    <Text variant="titleSmall">Диагностика GPS · QA</Text>
    <Text variant="bodySmall">Только для одной тестовой прогулки. Сырые данные шифруются на телефоне. Через 24 часа они недоступны и очищаются при следующем запуске или возврате в приложение. Не отправляются в историю и аналитику.</Text>
    {!active&&!capture?<Pressable disabled={busy||working} accessibilityRole="button" onPress={()=>{
      if(armed) onArmChange(false);
      else Alert.alert("Записать следующую прогулку для QA?","Будут сохранены точные координаты и время измерений. Избегайте маршрутов, раскрывающих ваш домашний адрес.",[
        {text:"Отмена",style:"cancel"},{text:"Согласен",onPress:()=>{if(isCurrent()) onArmChange(true);}},
      ]);
    }}><Text style={styles.action}>{armed?"✓ Запись подготовлена · отменить":"Включить для следующей прогулки"}</Text></Pressable>:null}
    {capture?<><Text variant="bodySmall">{capture.sampleCount} наблюдений{capture.truncated?" · лимит записи достигнут":""}</Text>
      <Pressable disabled={active||working||busy} accessibilityRole="button" onPress={exportCapture}><Text style={[styles.action,active&&styles.muted]}>Экспортировать после завершения</Text></Pressable>
      <Pressable disabled={working||busy} accessibilityRole="button" onPress={()=>void(async()=>{
        setWorking(true);
        try{await deleteWalkQaCapture(ownerId,capture.walkId);setCapture(null);onArmChange(false);}
        catch{setMessage("Не удалось удалить QA-запись.");}finally{setWorking(false);}
      })()}><Text style={styles.action}>Удалить запись</Text></Pressable></>:null}
    {message?<Text variant="bodySmall">{message}</Text>:null}
  </View>;
}
const styles=StyleSheet.create({panel:{padding:12,gap:8,borderRadius:12,backgroundColor:"#F8F4EA"},action:{fontWeight:"600",color:"#42653C"},muted:{opacity:.5}});
