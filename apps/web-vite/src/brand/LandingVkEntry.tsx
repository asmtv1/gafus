import {useRef, useState} from "react";
import {RouteLink,useRouteSearch} from "../shared/router/location";
import {apiRequest} from "../shared/api/client";
import button from "./LegacyVkIdOneTap.module.css";
import errorStyle from "./LegacyVkErrorBanner.module.css";

const knownErrors: Record<string,string>={
  vk_id_auth_failed:"Не удалось войти через VK ID. Попробуйте снова.",
  vk_context_expired:"Сессия VK ID истекла. Начните вход заново.",
  vk_id_token_failed:"Ошибка обмена кода VK ID. Проверьте настройки приложения.",
  vk_id_profile_failed:"Не удалось получить профиль VK. Попробуйте позже.",
  rate_limit:"Слишком много попыток. Подождите 15 минут.",
  session_required:"Войдите в аккаунт для привязки VK.",
};
/** Web OAuth uses the Refactor Hono PKCE/BFF start route. JWT credentials
 * remain HttpOnly and are never exposed to browser JavaScript. */
export function LandingVkErrorBanner(){
  const search=useRouteSearch();
  const raw=new URLSearchParams(search).get("error");
  const message=raw&&Object.hasOwn(knownErrors,raw)?knownErrors[raw]:null;
  return message?<div className={errorStyle.banner} role="alert">{message}</div>:null;
}
export function LandingVkEntry(){
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const inFlight=useRef(false);
  async function beginVkLogin(){
    if(inFlight.current)return;
    inFlight.current=true;setLoading(true);setError("");
    try{
      const {authorizeUrl}=await apiRequest<{authorizeUrl:string}>(
        "/api/v1/auth/vk-web/start",{method:"POST",json:{},browserAuth:true});
      const target=new URL(authorizeUrl);
      if(target.origin!=="https://id.vk.ru"||target.pathname!=="/authorize"||
          !target.searchParams.has("state")||!target.searchParams.has("code_challenge")||
          !target.searchParams.has("client_id"))throw Error("INVALID_VK_REDIRECT");
      window.location.assign(target.href);
    }catch{
      setError("Вход через VK временно недоступен. Попробуйте позже или войдите по паролю.");
      inFlight.current=false;setLoading(false);
    }
  }
  return <div className={button.wrapper}>
    {error&&<div className={button.error} role="alert">
      {error} {" "}<RouteLink to="/login">Перейти ко входу</RouteLink>.
    </div>}
    <button type="button" className={button.fallbackButton} disabled={loading}
      onClick={()=>void beginVkLogin()}>
      <span className={button.vkLogoSurface} aria-hidden="true">
        <svg viewBox="0 0 24 24" role="presentation">
          <path d="M19.665 13.826c-.272-.362-1.99-2.076-2.268-2.369-.28-.294-.382-.476-.099-.862.283-.386 1.209-1.531 1.47-1.997.259-.466.129-.628-.247-.628h-1.519c-.323 0-.472.17-.594.429 0 0-1.043 2.479-2.52 4.09-.478.52-.697.683-.957.683-.13 0-.318-.163-.318-.627V8.555c0-.51-.144-.74-.555-.74H9.73c-.307 0-.492.229-.492.444 0 .466.698.574.77 1.887v2.969c0 .65-.118.769-.378.769-.697 0-2.392-2.49-3.397-5.338-.2-.573-.402-.806-.728-.806H4.001c-.363 0-.435.17-.435.43 0 .465.697 2.774 3.242 5.826 1.696 2.083 4.086 3.214 6.261 3.214 1.305 0 1.467-.293 1.467-.798v-1.84c0-.587.124-.704.531-.704.299 0 .81.15 2.006 1.302 1.367 1.367 1.594 1.995 2.364 1.995h1.519c.432 0 .648-.216.523-.643-.137-.427-.632-1.047-1.814-2.376Z" />
        </svg>
      </span>
      <span>{loading?"Переходим в VK…":"Войти через VK"}</span>
    </button>
  </div>;
}
