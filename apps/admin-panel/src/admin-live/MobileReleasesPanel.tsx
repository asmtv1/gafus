import { useCallback, useEffect, useRef, useState } from "react";
import {VersionPublicationForm} from "./VersionPublicationForm";
import { requestAdmin } from "./api";

type Deployment = {
  id: string; appId: string; platform: string; environment: string;
  channel: string; runtimeVersion: string; signingKeyId: string;
  nativeFingerprint: string;
  activeReleaseId: string | null; previousReleaseId: string | null;
  rowVersion: number; paused: boolean; rolloutPercent: number;
};
type OtaRelease = {
  id: string; platform: string; environment: string; channel: string;
  runtimeVersion: string; revision: number; updateId: string; state: string;
  signingKeyId: string; nativeFingerprint: string; sourceSha: string; assetCount: number;
  assetsVerified: boolean; createdAt: string;
};
type NativeRelease = {
  id: string; platform: string; environment: string; distribution: string;
  appVersion: string; buildNumber: string; runtimeVersion: string;
  channel: string; signingKeyId: string; nativeFingerprint: string;
  sourceSha: string; verified: boolean;
  attestation?: {nativeArtifactSha256?:string;buildLogRef?:string;ciRunId?:string} | null;
};
type PatchDefinition = {
  id: string; version: string; sha256: string; allowedBases: unknown;
};
type PatchApplication = {
  id: string; patchDefinitionId: string; nativeReleaseId: string; baseSha: string;
  resultSha: string | null; operationId: string; state: string; version: string;
  sha256: string; platform: string; appVersion: string; runtimeVersion: string;
  createdAt: string;
};
type AuditEvent = {
  id: string; action: string; operationId: string; actorId: string;
  reason: string; createdAt: string; platform: string; runtimeVersion: string;
};
type TelemetrySummary = {
  platform: string;environment:string;channel:string;runtimeVersion:string;
  updateId:string|null;event:string;failureCode:string|null;
  events:number;installations:number;lastReportedAt:string;
};
type MandatoryControl = { platform: "ios" | "android"; runtimeVersion: string; required: boolean;
  version: string | null; revision: number; updatedAt: string };
type Tab = "deployments" | "native-releases" | "releases" | "mandatory-policies" | "patches" | "patch-applications" | "audit" | "telemetry";
const TABS: { key: Tab; title: string }[] = [
  { key: "deployments", title: "Публикации" },
  { key: "native-releases", title: "Нативные сборки" },
  { key: "releases", title: "OTA-релизы" },
  { key: "mandatory-policies", title: "Обязательное OTA iOS / Android" },
  { key: "patches", title: "Исходные патчи" },
  { key: "patch-applications", title: "Проверки патчей" },
  { key: "audit", title: "История" },
  { key: "telemetry", title: "Установки и ошибки" },
];
const ENDPOINT = "/api/v1/admin/mobile-ota";
function shortSha(value: string | null | undefined) {
  return value ? value.slice(0, 12) : "—";
}
export function MobileReleasesPanel({ source }: { source: unknown }) {
  const [tab, setTab] = useState<Tab>("deployments");
  const [rows, setRows] = useState<unknown[]>(Array.isArray(source) ? source : []);
  const [releases, setReleases] = useState<OtaRelease[]>([]);
  const [nativeReleases, setNativeReleases] = useState<NativeRelease[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>(Array.isArray(source) ? source as Deployment[] : []);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [patchManifestJson, setPatchManifestJson] = useState("");
  const [nativeManifestJson, setNativeManifestJson] = useState("");
  const [mandatoryPlatform, setMandatoryPlatform] = useState<"ios" | "android">("ios");
  const [mandatoryRuntime, setMandatoryRuntime] = useState("1.7.5");
  const [mandatoryVersion, setMandatoryVersion] = useState("1.7.5-ota.1");
  const writeLock = useRef(false);
  const load = useCallback(async (selected: Tab) => {
    try {
      const result = await requestAdmin<unknown[]>(`${ENDPOINT}/${selected}`);
      if (!Array.isArray(result)) throw Error("Неверный ответ реестра релизов");
      setRows(result);
      if (selected === "deployments") setDeployments(result as Deployment[]);
      if (selected === "native-releases") setNativeReleases(result as NativeRelease[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить реестр релизов");
    }
  }, []);
  useEffect(() => {
    if (tab !== "deployments") void load(tab);
  }, [tab, load]);
  useEffect(() => {
    void requestAdmin<OtaRelease[]>(`${ENDPOINT}/releases`)
      .then((response) => { if (Array.isArray(response)) setReleases(response); })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    void requestAdmin<NativeRelease[]>(`${ENDPOINT}/native-releases`)
      .then((result) => { if (Array.isArray(result)) setNativeReleases(result); })
      .catch(() => undefined);
  }, []);
  const changeMandatory = async (required: boolean) => {
    if (writeLock.current) return;
    const current=(rows as MandatoryControl[]).find(row=>row.platform===mandatoryPlatform &&
      row.runtimeVersion===mandatoryRuntime);
    const version=mandatoryVersion.trim()||null;
    const revision=required ? version : (current?.version ?? version);
    if (required && (!version || !/^\d+\.\d+\.\d+-ota\.[1-9]\d*$/.test(version) ||
       !version.startsWith(`${mandatoryRuntime}-ota.`))) {
      setError("Укажите подписанную ревизию той же нативной версии, например 1.7.5-ota.2");return;
    }
    const reason=window.prompt(`Причина ${required ? "включения" : "отключения"} обязательной OTA для ${mandatoryPlatform}/${mandatoryRuntime} (от 8 символов):`)?.trim();
    if(!reason || reason.length<8) return;
    if(!window.confirm(`${required ? "Включить блокировку до обновления" : "Отключить обязательность"} только для ${mandatoryPlatform}/${mandatoryRuntime}?\nТекущая ревизия политики: ${current?.revision ?? 0}.\nДругая платформа не изменится.\nСервер не разрешит включение без подтверждённой READY OTA.`))return;
    writeLock.current=true;setBusy(true);setError(null);setMessage(null);
    const operationId=crypto.randomUUID();
    try{
      await requestAdmin(`${ENDPOINT}/mandatory-policies`,{method:"PUT",body:{
        platform:mandatoryPlatform,runtimeVersion:mandatoryRuntime,required,
        version:revision,expectedRevision:current?.revision??0,operationId,reason,
      }});
      const updated=await requestAdmin<MandatoryControl[]>(`${ENDPOINT}/mandatory-policies`);
      const expected=updated.find(item=>item.platform===mandatoryPlatform && item.runtimeVersion===mandatoryRuntime);
      if(!expected || expected.revision!==(current?.revision??0)+1 || expected.required!==required || expected.version!==revision)
        throw Error("Сервер не подтвердил состояние после записи");
      setRows(updated);
      setMessage(`${mandatoryPlatform}/${mandatoryRuntime}: ${required ? "обязательная OTA включена" : "обязательная OTA отключена"}; другой платформы изменения не коснулись.`);
    }catch(error){
      setError(`${error instanceof Error?error.message:"Ошибка записи"}. Проверьте реестр перед повтором. Операция: ${operationId}`);
      try{await load("mandatory-policies");}catch{}
    }finally{writeLock.current=false;setBusy(false);}
  };
  const registerNative = async () => {
    if(writeLock.current || !nativeManifestJson.trim()) return;
    let input: Record<string,unknown>;
    try {
      const raw: unknown = JSON.parse(nativeManifestJson);
      if (!raw || typeof raw!=="object" || Array.isArray(raw)) throw Error("Ожидается JSON-объект");
      input=raw as Record<string,unknown>;
    } catch {setError("Некорректный JSON нативной сборки.");return;}
    if (!window.confirm("Зарегистрировать сведения о нативной сборке? Результат останется НЕПОДТВЕРЖДЁННЫМ, пока не проверены бинарник и дистрибуция. Никаких OTA не будет.")) return;
    writeLock.current=true;setBusy(true);setError(null);
    try {
      const data=await requestAdmin<{nativeReleaseId:string}>(`${ENDPOINT}/native-releases`,{
        method:"POST",body:input,
      });
      await load("native-releases");
      setMessage(`Нативная сборка ${data.nativeReleaseId} зарегистрирована без доверия; требуется проверка фактического бинарника.`);
      setNativeManifestJson("");
    } catch(e) {setError(`${e instanceof Error?e.message:"Ошибка регистрации"}. Проверьте реестр перед повтором.`);}
    finally {writeLock.current=false;setBusy(false);}
  };
  const verifyNative = async (native: NativeRelease, action: "VERIFY"|"REVOKE") => {
    if(writeLock.current) return;
    const reason=window.prompt(`Причина ${action==="VERIFY"?"подтверждения":"отзыва"} сборки ${native.platform}/${native.appVersion} (от 16 символов):`)?.trim();
    if(!reason || reason.length<16) return;
    const reference=window.prompt("Ссылка или ID отчёта проверки на устройстве/в магазине:")?.trim();
    if(!reference || reference.length<4) return;
    const nativeArtifactSha256=native.attestation?.nativeArtifactSha256;
    if(!nativeArtifactSha256 || !/^[a-f0-9]{64}$/.test(nativeArtifactSha256)) {
      setError("Отсутствует подтверждённый SHA256 исходного нативного артефакта. Невозможно выполнить действие.");
      return;
    }
    if(action==="VERIFY" && !window.confirm("Бинарник с указанным SHA256 действительно проверен на физическом устройстве?")) return;
    if(action==="VERIFY" && !window.confirm("Этот же бинарник подтверждён в указанном канале распространения?")) return;
    if(!window.confirm(`${action==="VERIFY"?"Подтвердить":"Отозвать"} конкретную нативную поставку?\n\n${native.platform} ${native.appVersion} (${native.buildNumber})\nRuntime ${native.runtimeVersion}\n${native.environment}\nSHA ${nativeArtifactSha256}`)) return;
    writeLock.current=true;setBusy(true);setError(null);
    const operationId=crypto.randomUUID();
    try {
      await requestAdmin(`${ENDPOINT}/native-releases/${native.id}/verification`,{
        method:"POST",body:{operationId,action,reason,
          evidence:{nativeArtifactSha256,physicalDeviceVerified:action==="VERIFY",
            distributionVerified:action==="VERIFY",reference}},
      });
      await load("native-releases");
      setMessage(`Операция ${operationId} записана в журнале; статус поставки перепроверен.`);
    } catch(e) {setError(`${e instanceof Error?e.message:"Ошибка статуса"}. Сверьте журнал, ID ${operationId}`);}
    finally {writeLock.current=false;setBusy(false);}
  };
  const importVerification = async (native:NativeRelease,file:File|undefined) => {
    if(!file || writeLock.current)return;
    writeLock.current=true;setBusy(true);setError(null);
    try{
      if(file.size>32000)throw Error("Слишком большой файл подтверждения.");
      const proof=JSON.parse(await file.text());
      if(proof.action!=="VERIFY" || proof.evidence?.nativeReleaseId!==native.id || !proof.evidence?.embeddedUpdateId)
        throw Error("Выберите отчёт проверки именно этой сборки с идентификатором встроенного обновления.");
      if(!window.confirm("Подтвердить проверку на устройстве и канал распространения для "+native.platform+" "+native.appVersion+" ("+native.buildNumber+")?"))return;
      await requestAdmin(ENDPOINT+"/native-releases/"+native.id+"/verification",{method:"POST",body:proof});
      await load("native-releases");
      setMessage("Подтверждение сборки сохранено.");
    }catch(e){setError(e instanceof Error?e.message:"Не удалось импортировать подтверждение.");}
    finally{writeLock.current=false;setBusy(false);}
  };
  const registerPatch = async () => {
    if (writeLock.current || !patchManifestJson.trim()) return;
    let definition: Record<string,unknown>;
    try {
      const parsed: unknown = JSON.parse(patchManifestJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Ожидается объект");
      definition = parsed as Record<string,unknown>;
    } catch {
      setError("Неверный JSON-манифест исходного пакета.");
      return;
    }
    if (!window.confirm("Зарегистрировать метаданные ПРИВАТНОГО исходного патча? Это не запускает CI, не меняет приложение и не публикует OTA.")) return;
    writeLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await requestAdmin<{id:string}>(`${ENDPOINT}/patches`, {
        method:"POST",body:definition,
      });
      await load("patches");
      setMessage(`Зарегистрирована только запись пакета ${data.id}. Приватный файл и применимость требуют независимой проверки CI.`);
      setPatchManifestJson("");
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Неизвестная ошибка"}. Проверьте реестр перед повтором.`);
    } finally { writeLock.current=false;setBusy(false); }
  };
  const requestPatchCheck = async (definition: PatchDefinition, native: NativeRelease) => {
    if (writeLock.current || !native.verified || !Array.isArray(definition.allowedBases) ||
      !definition.allowedBases.includes(native.sourceSha)) return;
    if (!window.confirm(`Зарегистрировать заявку на проверку исходников ${definition.version} для сборки ${native.platform} ${native.appVersion}?\n\nНе включает ЮKassa, не меняет OTA или магазинный релиз.`)) return;
    writeLock.current=true;
    setBusy(true);
    setError(null);
    const operationId=crypto.randomUUID();
    try {
      await requestAdmin(`${ENDPOINT}/patch-applications`,{
        method:"POST",body:{operationId,patchDefinitionId:definition.id,
          nativeReleaseId:native.id,baseSha:native.sourceSha},
      });
      setTab("patch-applications");
      await load("patch-applications");
      setMessage(`Создан черновик проверки патча ${definition.version}. Операция: ${operationId}`);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Ошибка регистрации"}. Проверьте состояние по ID ${operationId}`);
    } finally { writeLock.current=false;setBusy(false); }
  };
  const createDeployment = async (native: NativeRelease) => {
    if (writeLock.current || !native.verified) return;
    const reason = window.prompt(
      `Причина создания OTA-канала для ${native.platform}/${native.appVersion}/${native.environment}:`,
    )?.trim();
    if (!reason || reason.length < 8) return;
    if (!window.confirm(`Создать НОВУЮ ПРИОСТАНОВЛЕННУЮ публикацию?\n\n${native.platform} · ${native.environment} · ${native.channel} · ${native.runtimeVersion}\nНикакие обновления пока не будут выдаваться.`)) return;
    writeLock.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    const operationId = crypto.randomUUID();
    try {
      await requestAdmin(`${ENDPOINT}/deployments`, {
        method: "POST", body: {operationId,nativeReleaseId:native.id,reason},
      });
      await load("deployments");
      setMessage(`Публикация создана в режиме паузы. Операция: ${operationId}`);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Неизвестная ошибка"}. Проверьте состояние канала перед повтором. ID: ${operationId}`);
      await load("deployments");
    } finally {
      writeLock.current = false;
      setBusy(false);
    }
  };
  const mutate = async (deployment: Deployment, action: "pause" | "publish" | "rollout", releaseId?: string, rolloutPercent?: 0 | 1 | 10 | 50 | 100) => {
    if (writeLock.current) return;
    const reason = window.prompt(
      action === "pause"
        ? `Причина паузы ${deployment.platform}/${deployment.channel}/${deployment.runtimeVersion} (от 8 символов):`
        : action === "rollout"
          ? `Причина расширения OTA до ${rolloutPercent}% (от 8 символов):`
          : `Причина публикации ${deployment.platform}/${deployment.channel}/${deployment.runtimeVersion}, update ${releaseId} для ${rolloutPercent===0 ? "только admin/asmtv1" : `${rolloutPercent ?? 100}% пользователей`} (от 8 символов):`,
    )?.trim();
    if (!reason || reason.length < 8) return;
    if (!window.confirm(
      `${action === "publish" ? "Опубликовать" : action === "rollout" ? "Расширить" : "Приостановить"} OTA для ${deployment.platform}/${deployment.environment}/${deployment.channel}/${deployment.runtimeVersion}?\n\nТекущая ревизия: ${deployment.rowVersion}\nПодпись: ${deployment.signingKeyId}\nРелиз: ${releaseId ?? "приостановка без смены версии"}`,
    )) return;
    writeLock.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    const operationId = crypto.randomUUID();
    try {
      await requestAdmin(`${ENDPOINT}/deployments/${deployment.id}/${action}`, {
        method: "POST",
        body: {
          operationId,
          expectedVersion: deployment.rowVersion,
          reason,
          ...(releaseId ? { releaseId } : {}),
          ...(rolloutPercent !== undefined ? { rolloutPercent } : {}),
        },
      });
      await load("deployments");
      setMessage(`Операция ${operationId} подтверждена чтением реестра.`);
    } catch (e) {
      // Never retry an uncertain write blindly: the operationId is recorded.
      setError(`${e instanceof Error ? e.message : "Неизвестный ответ"}. Проверьте журнал и состояние перед повтором. Операция: ${operationId}`);
      await load("deployments");
    } finally {
      writeLock.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="content-card">
      <h2>Мобильные релизы</h2>
      <VersionPublicationForm />
      <details><summary>Реестр, история и дополнительные настройки</summary>
      <p className="note">Собственный OTA включается только для проверенных нативных поставок и подписанных артефактов. Существующий EAS не переключается отсюда.</p>
      <div className="filter-toolbar" role="tablist" aria-label="Реестр OTA">
        {TABS.map(({ key, title }) => (
          <button role="tab" key={key} className={tab === key ? "" : "secondary"}
            aria-selected={tab === key} disabled={busy}
            onClick={() => { setTab(key); setError(null); setMessage(null); }}>
            {title}
          </button>
        ))}
        <button className="secondary" disabled={busy} onClick={() => void load(tab)}>Обновить</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status">{message}</p>}
      {rows.length === 0 && <p className="note">Для этого раздела ещё нет зарегистрированных записей.</p>}
      {tab === "mandatory-policies" && <div className="content-card">
        <h3>Независимая обязательная OTA, начиная с 1.7.5</h3>
        <p className="note">iOS и Android управляются отдельно. Включение допускается только при проверенном нативном билде и активном подписанном READY-релизе соответствующего runtime. При 0% охвата блокировка действует лишь на тестовые установки, которым доступна подписанная ревизия.</p>
        {(rows as MandatoryControl[]).map(item=><p key={`${item.platform}/${item.runtimeVersion}`}>
          <strong>{item.platform} · {item.runtimeVersion}</strong> — {item.required?`обязательно ${item.version}`:"не обязательно"} · политика #{item.revision}
        </p>)}
        <div className="filter-toolbar">
          <label>Платформа
            <select value={mandatoryPlatform} disabled={busy} onChange={e=>setMandatoryPlatform(e.target.value as "ios"|"android")}>
              <option value="ios">iOS</option><option value="android">Android</option>
            </select>
          </label>
          <label>Нативный runtime
            <input aria-label="Runtime обязательного OTA" value={mandatoryRuntime} disabled={busy} onChange={e=>setMandatoryRuntime(e.target.value)} placeholder="1.7.5" />
          </label>
          <label>Минимальная подписанная ревизия
            <input aria-label="Версия обязательного OTA" value={mandatoryVersion} disabled={busy} onChange={e=>setMandatoryVersion(e.target.value)} placeholder="1.7.5-ota.2" />
          </label>
        </div>
        <div className="filter-toolbar">
          <button disabled={busy} onClick={()=>void changeMandatory(true)}>Сделать OTA обязательной</button>
          <button className="secondary" disabled={busy} onClick={()=>void changeMandatory(false)}>Отключить обязательность</button>
        </div>
      </div>}
      {tab === "deployments" && nativeReleases.filter((native) => native.verified &&
        !deployments.some((d) => d.appId === "gafus" && d.platform === native.platform &&
          d.environment === native.environment && d.channel === native.channel &&
          d.runtimeVersion === native.runtimeVersion && d.signingKeyId === native.signingKeyId &&
          d.nativeFingerprint === native.nativeFingerprint)
      ).map((native) => (
        <div className="content-card" key={`candidate-${native.id}`}>
          <b>Новая публикация: {native.platform} {native.appVersion} ({native.environment})</b>
          <p>Канал {native.channel} · Runtime {native.runtimeVersion} · сертификат {native.signingKeyId}</p>
          <button disabled={busy} onClick={() => void createDeployment(native)}>
            Создать приостановленный канал
          </button>
        </div>
      ))}
      {tab === "deployments" && (rows as Deployment[]).map((d) => {
        const candidates = releases.filter((r) => r.state === "READY" && r.assetsVerified &&
          r.assetCount > 0 && r.platform === d.platform && r.environment === d.environment &&
          r.channel === d.channel && r.runtimeVersion === d.runtimeVersion &&
          r.signingKeyId === d.signingKeyId &&
          r.nativeFingerprint === d.nativeFingerprint && r.id !== d.activeReleaseId);
        return (
          <div className="content-card" key={d.id}>
            <h3>{d.platform} · {d.environment} · {d.channel}</h3>
            <p>Runtime: {d.runtimeVersion}. Ключ: {d.signingKeyId}. Ревизия: {d.rowVersion}. Native SHA: {shortSha(d.nativeFingerprint)}.</p>
            <p>Активный релиз: {shortSha(d.activeReleaseId)} · {d.paused ? "Пауза" : d.rolloutPercent === 0 ? "Только admin и asmtv1" : `Выдача ${d.rolloutPercent}%`}</p>
            {!d.paused && <button className="secondary" disabled={busy}
              onClick={() => void mutate(d, "pause")}>Приостановить выдачу</button>}
            {!d.paused && d.activeReleaseId && d.rolloutPercent < 100 && (
              <div className="filter-toolbar">
                {([1,10,50,100] as const).filter(pct=>pct>d.rolloutPercent).map(pct=>(
                  <button key={`rollout-${pct}`} className="secondary" disabled={busy}
                    onClick={()=>void mutate(d,"rollout",undefined,pct)}>
                    Расширить до {pct}%
                  </button>
                ))}
              </div>
            )}
            {candidates.length > 0 && <div className="filter-toolbar">
              {candidates.map((r) => (
                <div key={r.id} className="filter-toolbar">
                  <button disabled={busy}
                    onClick={() => void mutate(d, "publish", r.id, 0)}>
                    Только admin/asmtv1 · #{r.revision}
                  </button>
                  <button className="secondary" disabled={busy}
                    onClick={() => void mutate(d, "publish", r.id, 1)}>
                    Опубликовать #{r.revision} на 1% · {shortSha(r.updateId)}
                  </button>
                  <button className="secondary" disabled={busy}
                    onClick={() => void mutate(d, "publish", r.id, 100)}>
                    Опубликовать #{r.revision} на 100%
                  </button>
                </div>
              ))}
            </div>}
          </div>
        );
      })}
      {tab === "native-releases" && (
        <div className="content-card">
          <h3>Регистрация нативной поставки</h3>
          <p className="note">Только сертификат и публичные сведения сборки, без приватного ключа. Новая запись не доверенная до отдельной приёмки устройства и дистрибуции.</p>
          <textarea rows={6} aria-label="JSON-манифест нативной сборки"
            placeholder='{"operationId":"…","platform":"ios","environment":"preview","distribution":"internal","bundleId":"ru.gafus.app","appVersion":"1.7.5","buildNumber":"100","runtimeVersion":"1.7.5","channel":"preview","updateUrl":"https://preview.gafus.ru/ota/manifest","signingKeyId":"…","certificatePem":"-----BEGIN CERTIFICATE-----…","nativeFingerprint":"…","sourceSha":"…","provenance":{"ciRunId":"…","nativeArtifactSha256":"…","buildLogRef":"…"}}'
            value={nativeManifestJson} onChange={e=>setNativeManifestJson(e.target.value)}
            disabled={busy} style={{width:"100%",minHeight:130}} />
          <button disabled={busy || !nativeManifestJson.trim()} onClick={()=>void registerNative()}>
            Зарегистрировать без активации
          </button>
        </div>
      )}
      {tab === "native-releases" && (rows as NativeRelease[]).map((r) => (
        <div key={r.id} className="content-card">
          <b>{r.platform} {r.appVersion} ({r.buildNumber})</b>
          <p>{r.environment} · {r.distribution} · Runtime {r.runtimeVersion} · SHA {shortSha(r.sourceSha)}</p>
          <p>{r.verified ? "Нативная поставка подтверждена" : "Не подтверждена"}</p>
          <p>Артефакт SHA256: {r.attestation?.nativeArtifactSha256 ?? "не указан"}</p>
          <div className="filter-toolbar">
            <label>Отчёт проверки сборки <input type="file" accept=".json,application/json" disabled={busy}
              onChange={e=>{const file=e.target.files?.[0];e.target.value="";void importVerification(r,file);}}/></label>
            <button className="secondary" disabled={busy} onClick={()=>void verifyNative(r,r.verified?"REVOKE":"VERIFY")}>
              {r.verified?"Отозвать поставку":"Подтвердить после QA"}
            </button>
          </div>
        </div>
      ))}
      {tab === "releases" && (rows as OtaRelease[]).map((r) => (
        <div key={r.id} className="content-card">
          <b>{r.platform}/{r.environment}/{r.channel} · #{r.revision}</b>
          <p>Runtime {r.runtimeVersion} · {r.state} · Assets {r.assetCount}, {r.assetsVerified ? "проверены" : "не проверены"}</p>
          <p>Update {r.updateId} · Source {shortSha(r.sourceSha)}</p>
        </div>
      ))}
      {tab === "patches" && (
        <div className="content-card">
          <h3>Зарегистрировать приватный исходный пакет</h3>
          <p className="note">Только манифест проверенного файла из закрытого хранилища. Источник не выполняется, OTA не меняется. Требуется отдельная проверка и новая магазинная сборка.</p>
          <textarea rows={6} aria-label="JSON-манифест исходного пакета"
            placeholder='{"operationId":"…","version":"1.0.0","sha256":"…","allowedBases":["…"],"allowedPaths":["…"],"nativeRequirements":{"publication":"NEW_NATIVE_BUILD_AND_APP_REVIEW","targetPlatform":"ios","minimumVersion":"1.7.5","otaCompatible":false},"sourceLocation":"private://mobile-patches/…patch"}'
            value={patchManifestJson} onChange={(e) => setPatchManifestJson(e.target.value)}
            disabled={busy} style={{width:"100%",minHeight:130}} />
          <button disabled={busy || !patchManifestJson.trim()} onClick={() => void registerPatch()}>
            Зарегистрировать метаданные
          </button>
        </div>
      )}
      {tab === "patches" && (rows as PatchDefinition[]).map((r) => (
        <div key={r.id} className="content-card">
          <b>{r.version}</b><p>SHA256: {r.sha256}</p>
          <p>Разрешённые исходные базы: {Array.isArray(r.allowedBases) ? r.allowedBases.join(", ") : "не определены"}</p>
          <p className="note">Патч исходников не может быть опубликован как OTA.</p>
          {nativeReleases.filter((n) => n.verified && n.platform === "ios" &&
            Array.isArray(r.allowedBases) && r.allowedBases.includes(n.sourceSha)).map((n) => (
            <button key={n.id} disabled={busy} onClick={() => void requestPatchCheck(r,n)}>
              Проверить применимость к {n.appVersion} ({shortSha(n.sourceSha)})
            </button>
          ))}
        </div>
      ))}
      {tab === "patch-applications" && (rows as PatchApplication[]).map((r) => (
        <div key={r.id} className="content-card">
          <b>Исходный пакет {r.version} · {r.state}</b>
          <p>Цель: {r.platform} {r.appVersion} · Runtime {r.runtimeVersion}</p>
          <p>База {shortSha(r.baseSha)} · Результат {shortSha(r.resultSha)} · SHA патча {shortSha(r.sha256)}</p>
          <p>Заявка {r.operationId}</p>
          <p className="note">Это история исходных изменений. Пока нет отдельного подтверждённого native+review релиза, восстановление недоступно пользователям.</p>
        </div>
      ))}
      {tab === "telemetry" && (
        <p className="note">События, сообщённые устройствами за 30 дней. Не являются подтверждённой сервером статистикой установок. Личные данные и полные тексты ошибок не сохраняются.</p>
      )}
      {tab === "telemetry" && (rows as TelemetrySummary[]).map((r,i)=>(
        <div key={`${r.platform}-${r.updateId}-${r.event}-${r.failureCode}-${i}`} className="content-card">
          <b>{r.event}{r.failureCode?` · ${r.failureCode}`:""}</b>
          <p>{r.platform} · {r.environment}/{r.channel} · {r.runtimeVersion}</p>
          <p>Update {shortSha(r.updateId)} · событий {r.events} · установок {r.installations}</p>
          <p>Последний отчёт: {r.lastReportedAt}</p>
        </div>
      ))}
      {tab === "audit" && (rows as AuditEvent[]).map((r) => (
        <div key={r.id} className="content-card">
          <b>{r.action} · {r.platform}/{r.runtimeVersion}</b>
          <p>{r.createdAt} · {r.actorId} · {r.reason}</p>
          <p>Operation {r.operationId}</p>
        </div>
      ))}
      </details>
    </section>
  );
}
