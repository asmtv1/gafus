import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { NextProfileIcon } from "./NextProfileIcon";
import styles from "../../brand/LegacyNotificationStatus.module.css";
import { PrimaryButton , SecondaryButton} from "../../shared/ui";
import { browserPushSupported, connectBrowserPushOnUserGesture } from "./browserPushEnrollment";

type Permission = NotificationPermission | "unsupported";

/** Source SettingsActions notification status with actual browser and Hono readbacks.
 * Push-only worker registration happens only on an explicit click and only
 * after signed owner confirmation; no browser PWA installation is introduced.
 */
export function LegacyNotificationStatus({ ownerId }: {ownerId?:string}) {
  const [permission, setPermission] = useState<Permission | null>(null);
  const [localSubscription, setLocalSubscription] = useState<boolean | null>(null);
  const [server, setServer] = useState<{ownerId:string; active:boolean} | null>(null);
  const [device, setDevice] = useState<{ownerId:string; registered:boolean}|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpointRef = useRef<{ownerId:string; endpoint:string}|null>(null);
  const ownerRef = useRef(ownerId);
  const flight = useRef(false);
  ownerRef.current=ownerId;
  useEffect(()=>{
    if (!ownerId) return;
    let alive=true;
    void apiRequest<unknown>("/api/v1/user/push-subscription-status",{
      method:"GET",browserAuth:true,expectedStatus:200,
    }).then(data=>{
      if(!alive||typeof data!=="object"||data===null||
        typeof (data as {active?:unknown}).active!=="boolean")return;
      setServer({ownerId,active:(data as {active:boolean}).active});
    }).catch(()=>undefined);
    return()=>{alive=false;};
  },[ownerId]);
  useEffect(() => {
    let current = true;
    const check = async () => {
      if (!("Notification" in window) || !("serviceWorker" in navigator) ||
          !("PushManager" in window)) {
        if (current) { setPermission("unsupported"); setLocalSubscription(false); }
        return;
      }
      const value = Notification.permission;
      if (current) setPermission(value);
      try {
        // Do not register a worker as a side effect of opening Settings.
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (current) setLocalSubscription(!!subscription);
        if(current && ownerId && subscription?.endpoint &&
          subscription.endpoint.startsWith("https://")){
          const endpoint=subscription.endpoint;
          endpointRef.current={ownerId,endpoint};
          try{
            const result=await apiRequest<unknown>("/api/v1/subscriptions/push/device-status",{
              method:"POST",json:{endpoints:[endpoint]},browserAuth:true,expectedStatus:200,
            });
            const value=result as {determined?:unknown;hasThisDeviceSubscription?:unknown};
            if(current&&ownerRef.current===ownerId&&value?.determined===true&&
              typeof value.hasThisDeviceSubscription==="boolean")
              setDevice({ownerId,registered:value.hasThisDeviceSubscription});
          }catch{ /* Status is unknown. Do not guess or permit disable. */ }
        }
      } catch {
        if (current) setLocalSubscription(null);
      }
    };
    void check();
    return () => { current = false; };
  }, [ownerId]);
  async function enable(){
    if (!ownerId || flight.current || !browserPushSupported()) return;
    flight.current=true;setBusy(true);setError("");
    try {
      const {endpoint} = await connectBrowserPushOnUserGesture(()=>ownerRef.current, ownerId);
      if (ownerRef.current !== ownerId) return;
      endpointRef.current={ownerId,endpoint};
      setPermission("granted");setLocalSubscription(true);
      setDevice({ownerId,registered:true});
      setServer({ownerId,active:true});
    } catch(error) {
      if (ownerRef.current !== ownerId) return;
      const code = error instanceof Error ?
        ("code" in error && typeof error.code === "string" ? error.code : error.message) : "";
      setError(code === "BROWSER_PUSH_PERMISSION_DENIED"
        ? "Разрешите уведомления в настройках браузера, чтобы получать напоминания."
        : code === "PUSH_ENDPOINT_OWNER_CONFLICT"
          ? "Подписка этого браузера привязана к другому аккаунту. Сначала отключите её там."
          : "Не удалось подтвердить подключение уведомлений. Проверьте разрешения и повторите.");
    } finally {flight.current=false;if(ownerRef.current===ownerId)setBusy(false);}
  }
  async function disable(){
    if(!ownerId||flight.current||device?.ownerId!==ownerId||!device.registered||
       endpointRef.current?.ownerId!==ownerId||!server?.active)return;
    flight.current=true;setBusy(true);setError("");
    try{
      const registration=await navigator.serviceWorker.getRegistration();
      const subscription=await registration?.pushManager.getSubscription();
      if(!subscription?.endpoint||subscription.endpoint!==endpointRef.current.endpoint||
        ownerRef.current!==ownerId)throw Error("SUBSCRIPTION_CHANGED");
      try{
        await apiRequest<unknown>("/api/v1/subscriptions/push",{
          method:"DELETE",json:{endpoint:subscription.endpoint},browserAuth:true,
          expectedStatus:200,
        });
      }catch{/* Unknown ACK can be reconciled by a fresh owner-scoped GET. */}
      const readback=await apiRequest<unknown>("/api/v1/subscriptions/push/device-status",{
        method:"POST",json:{endpoints:[subscription.endpoint]},browserAuth:true,
        expectedStatus:200,
      }) as {determined?:boolean;hasThisDeviceSubscription?:boolean};
      if(ownerRef.current!==ownerId)return;
      if(!readback?.determined||readback.hasThisDeviceSubscription!==false)
        throw Error("SUBSCRIPTION_DELETE_NOT_CONFIRMED");
      setDevice({ownerId,registered:false});
      endpointRef.current=null;
      const stopped=await subscription.unsubscribe();
      if(ownerRef.current!==ownerId)return;
      if(stopped)setLocalSubscription(false);
      else setError("Запись на сервере удалена, но браузер не подтвердил отключение.");
      try{
        const state=await apiRequest<{active:boolean}>("/api/v1/user/push-subscription-status",{
          method:"GET",browserAuth:true,expectedStatus:200,
        });
        if(ownerRef.current===ownerId&&typeof state?.active==="boolean")
          setServer({ownerId,active:state.active});
      }catch{/* If mobile subscription remains, account may still be active. */}
    }catch{
      if(ownerRef.current===ownerId)
        setError("Отключение не подтверждено сервером. Автоматический повтор запрещён.");
    }finally{flight.current=false;if(ownerRef.current===ownerId)setBusy(false);}
  }
  /** The prominent toggle controls the account-wide state shown in the card.
   * This is deliberately separate from the granular current-device control in
   * Details. Deleting all subscriptions also affects mobile devices, so an
   * explicit confirmation is mandatory before touching server state.
   */
  async function disableAll(){
    if(!ownerId || flight.current || server?.ownerId!==ownerId || !server.active)return;
    if(!window.confirm("Выключить push-уведомления GAFUS на всех ваших устройствах?"))return;
    if(ownerRef.current!==ownerId)return;
    flight.current=true;setBusy(true);setError("");
    try {
      try {
        await apiRequest<unknown>("/api/v1/subscriptions/push",{
          method:"DELETE",json:{deleteAll:true},browserAuth:true,expectedStatus:200,
        });
      }catch{/* An unknown DELETE acknowledgement must be verified by GET. */}
      const state=await apiRequest<{active:boolean}>("/api/v1/user/push-subscription-status",{
        method:"GET",browserAuth:true,expectedStatus:200,
      });
      if(ownerRef.current!==ownerId)return;
      if(state?.active!==false)throw Error("ACCOUNT_UNSUBSCRIBE_NOT_CONFIRMED");
      setServer({ownerId,active:false});
      // Unsubscribe only this owner's *confirmed* browser endpoint, never a
      // locally cached endpoint that may belong to another signed-in owner.
      if(device?.ownerId===ownerId&&device.registered&&localSubscription&&
        endpointRef.current?.ownerId===ownerId){
        const expected=endpointRef.current.endpoint;
        setDevice({ownerId,registered:false});
        try {
          const registration=await navigator.serviceWorker.getRegistration();
          const subscription=await registration?.pushManager.getSubscription();
          if(subscription?.endpoint===expected){
            const stopped=await subscription.unsubscribe();
            if(ownerRef.current!==ownerId)return;
            if(stopped){setLocalSubscription(false);endpointRef.current=null;}
            else setError("На сервере уведомления выключены, но браузер не подтвердил отключение.");
          }
        }catch{
          if(ownerRef.current===ownerId)
            setError("На сервере уведомления выключены, но браузер не подтвердил отключение.");
        }
      }
    }catch{
      if(ownerRef.current===ownerId)
        setError("Отключение не подтверждено сервером. Автоматический повтор запрещён.");
    }finally{flight.current=false;if(ownerRef.current===ownerId)setBusy(false);}
  }
  const accountActive=!!ownerId&&server?.ownerId===ownerId&&server.active;
  const currentDeviceActive=accountActive&&permission==="granted"&&!!localSubscription&&
    device?.ownerId===ownerId&&device.registered;
  // The original Next card shows only browser permission + server subscription.
  // Keep additional device diagnostics and reversible owner-only controls in a
  // native disclosure, rather than changing the source page's layout height.
  return <section className={styles.container} aria-label="Состояние уведомлений"
    data-next-notification-status>
    <h3><NextProfileIcon name="notifications" size={40}/> Уведомления</h3>
    {permission === "unsupported" &&
      <p>Этот браузер не поддерживает push-уведомления.</p>}
      <div className={styles.status}>
        <div className={styles.statusItem}>
          <strong>Разрешение браузера:</strong>
          <span className={styles.statusValue}>
            {permission === null ? "⏳ Проверяется..." :
              permission === "unsupported" ? "❌ Не поддерживается" :
              permission === "granted" ? "✅ Разрешено" :
                permission === "denied" ? "❌ Отклонено" : "⏳ Не запрошено"}
          </span>
        </div>
        <div className={styles.statusItem}>
          <strong>Серверная подписка:</strong>
          <span className={styles.statusValue}>
            {!server || server.ownerId !== ownerId || !ownerId ? "⏳ Проверяется..." :
              server.active ? "✅ Активна" : "❌ Неактивна"}
          </span>
        </div>
      </div>
    {accountActive&&<div className={styles.actions}>
      <SecondaryButton variant="red" type="button" disabled={busy}
        className={styles.toggleButton} onClick={()=>void disableAll()}>
        {busy?"Проверяем отключение…":"Выключить уведомления"}
      </SecondaryButton>
      <p className={styles.accountHint}>На всех устройствах — после подтверждения.</p>
    </div>}
    {ownerId&&server?.ownerId===ownerId&&!server.active&&
      permission!==null&&permission!=="denied"&&permission!=="unsupported"&&
      browserPushSupported()&&
      <div className={styles.actions}>
        <PrimaryButton disabled={busy} className={styles.toggleButton}
          onClick={()=>void enable()}>
          {busy?"Подключаем…":"Включить уведомления в браузере"}
        </PrimaryButton>
      </div>}
    {ownerId && /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      <p className={styles.help}>На iPhone используйте приложение GAFUS из App Store.
        Установка веб-сайта на экран «Домой» не нужна.</p>}
    {permission === "denied" &&
      <div className={styles.actions}>
        <div className={styles.help}><p>Уведомления заблокированы в браузере.</p></div>
      </div>}
    <details className={styles.deviceDetails}>
      <summary>Подробности уведомлений на этом устройстве</summary>
      <div className={styles.status}>
        <div className={styles.statusItem}>
          <strong>Подписка в браузере:</strong>
          <span className={styles.statusValue}>
            {localSubscription === null ? "⏳ Не подтверждена" :
              localSubscription ? "✅ Создана" : "❌ Неактивна"}
          </span>
        </div>
      </div>
      <p className={styles.help}>Статус аккаунта не означает, что уведомления
        доступны в этом браузере. Подключение нового устройства требует
        действительного WebPush VAPID и Service Worker.</p>
      {accountActive&&!currentDeviceActive&&permission!=="denied"&&
        browserPushSupported()&&localSubscription===false&&
        <div className={styles.actions}>
          <PrimaryButton type="button" disabled={busy} onClick={()=>void enable()}>
            {busy?"Подключаем…":"Подключить уведомления на этом устройстве"}
          </PrimaryButton>
        </div>}
      {currentDeviceActive&&<div className={styles.actions}>
          <SecondaryButton variant="red" type="button" className={styles.denyButton} disabled={busy}
            onClick={()=>void disable()}>
            {busy?"Проверяем отключение…":"Отключить уведомления на этом устройстве"}
          </SecondaryButton>
        </div>}
    </details>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
