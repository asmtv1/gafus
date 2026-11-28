import { useEffect, useState } from "react";
import { requestAdmin } from "./api";

type Quality = {
  platform:string; runtimeVersion:string; revision:number; updateId:string; build:string; nativeReleaseId:string;
  sessions:number; installations:number; errorSessions:number; errors:number; fatalEvents:number;
  launchedInstallations:number; otaFailureInstallations:number; downloadedInstallations:number; launchedAfterDownload:number;
};
export function useMobileDiagnosticQuality(enabled=true) {
  const [rows,setRows]=useState<Quality[]|null>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();
    setFailed(false);
    void requestAdmin<Quality[]>("/api/v1/admin/mobile-ota/diagnostic-quality",{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted&&Array.isArray(data))setRows(data);})
      .catch(()=>{if(!controller.signal.aborted)setFailed(true);});
    return ()=>controller.abort();
  },[enabled]);
  return {rows,failed};
}
export function diagnosticWarning(rows:Quality[]):string|null {
  if(rows.some(row=>row.fatalEvents>0||row.otaFailureInstallations>0))
    return "Есть сообщения о критических ошибках или проблемах OTA. Проверьте их перед массовой публикацией.";
  if(rows.some(row=>row.sessions>=20&&row.errorSessions/row.sessions>=0.05))
    return "Не менее 5% наблюдаемых JS-сессий этой сборки содержат ошибки. Проверьте причины перед выпуском.";
  if(!rows.length||rows.some(row=>row.sessions<20))
    return "Недостаточно наблюдаемых сессий для оценки качества этой ревизии.";
  return null;
}
export function MobileDiagnosticQuality({rows,failed,compact=false}:{
  rows:Quality[]|null;failed:boolean;compact?:boolean;
}) {
  if(failed)return <p className="note">Статистика диагностики недоступна; это не подтверждение стабильности.</p>;
  if(!rows)return <p className="note">Загрузка диагностической статистики…</p>;
  return <section className="content-card">
    <b>Качество OTA за 24 часа</b>
    <p className="note">Наблюдаемые JS-сессии и отчёты устройств. Не crash-free rate и не число уникальных пользователей.</p>
    {compact&&diagnosticWarning(rows)&&<p role="status">{diagnosticWarning(rows)}</p>}
    {rows.length===0&&<p>Нет данных по выбранной ревизии.</p>}
    {rows.map(row=><div key={row.updateId}>
      <p><b>{row.platform} · {row.runtimeVersion} · сборка {row.build} · OTA {row.revision}</b></p>
      <p>JS-сессий: {row.sessions} · диагностических установок: {row.installations} · ошибок: {row.errors} · FATAL: {row.fatalEvents}</p>
      <p>JS-сессий с ошибками: {row.errorSessions}{row.sessions>=20?` (${(100*row.errorSessions/row.sessions).toFixed(1)}%)`:" (недостаточно данных для доли)"}</p>
      <p>Установок, сообщивших запуск OTA: {row.launchedInstallations} · проблемы OTA: {row.otaFailureInstallations}</p>
      <p>Запуск после скачивания: {row.launchedAfterDownload} из {row.downloadedInstallations}{row.downloadedInstallations>=20?` (${(100*row.launchedAfterDownload/row.downloadedInstallations).toFixed(1)}%)`:" (недостаточно данных для доли)"}</p>
    </div>)}
    <a href="https://app.uptrace.dev/metrics/9378/55388" target="_blank" rel="noopener noreferrer">Подробная диагностика в Uptrace</a>
  </section>;
}
