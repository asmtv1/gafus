import { RouteLink, type RoutePath } from "../../shared/router/location";
import { useLogout } from "../../shared/auth/useAuth";
import { NextProfileIcon, type ProfileIconName } from "./NextProfileIcon";
import { LogoutAllSessionsAction } from "./LogoutAllSessionsAction";
import { LegacyNotificationStatus } from "./LegacyNotificationStatus";
import { resetCookieConsent } from "@gafus/ui-components/cookie-consent";
import {restartProfileTour} from "./NextTourHost";
import type { ProfileOverview } from "./profileApi";
import source from "../../brand/LegacySettingsActions.module.css";

type InternalItem = { label: string; to: RoutePath; icon: ProfileIconName; detail?: string };
type ExternalItem = { label: string; href: string; icon: ProfileIconName };

function InternalRow({item}: {item: InternalItem}) {
  return <RouteLink to={item.to} className={`${source.row} next-profile-settings-row`}>
    <NextProfileIcon name={item.icon}/>
    <span>{item.label}{item.detail && <small>{item.detail}</small>}</span>
    <span aria-hidden="true">›</span>
  </RouteLink>;
}
function ExternalRow({item}: {item: ExternalItem}) {
  return <a className={`${source.row} next-profile-settings-row`}
    href={item.href} {...(item.href.startsWith("https:") ?
      {target:"_blank",rel:"noopener noreferrer"} : {})}>
    <NextProfileIcon name={item.icon}/>
    <span>{item.label}</span><span aria-hidden="true">›</span>
  </a>;
}
function Group({title,children}:{title:string;children:React.ReactNode}) {
  return <div className={source.settingsGroup}>
    <h2 className={source.groupTitle}>{title}</h2>{children}
  </div>;
}
/** Source SettingsActions layout and 40px illustration assets. Every enabled
 * row has a real destination or existing Hono mutation, never a fake success.
 */
export function LegacyProfileSettings({profile}: {profile?:ProfileOverview}) {
  const logout = useLogout();
  const account: InternalItem[] = [
    {label:"Логин",to:"/profile/change-username",icon:"login",detail:profile?.username},
    {label:"Email",to:"/profile/change-email",icon:"email",
      detail:profile?.email?.trim()||"Укажите email для восстановления доступа"},
    // Source Next picks set-password when passwordSetAt is null or the auth
    // snapshot has not included it. An omitted optional Hono projection must
    // never route a passwordless account straight to change-password.
    ...(profile?.hasAppPassword ?
      [{label:"Сменить пароль",to:"/profile/change-password",icon:"password"} as const] :
      [{label:"Установить пароль",to:"/profile/set-password",icon:"password"} as const]),
    ...(profile?.hasAppPassword ?
      [{label:"Забыли пароль",to:"/passwordReset",icon:"password"} as const] : []),
  ];
  const information:ExternalItem[] = [
    {label:"Наш Телеграм",href:"https://t.me/gafusRu",icon:"telegram"},
    {label:"Политика конфиденциальности",href:"/policy.html",icon:"privacy"},
    {label:"Оферта",href:"/oferta.html",icon:"offer"},
    {label:"Согласие на обработку персональных данных",href:"/personal.html",icon:"consent"},
    {label:"Согласие на распространение данных",href:"/personal-distribution.html",icon:"distribution"},
    {label:"Связаться с поддержкой",href:"https://t.me/gafus_support",icon:"support"},
  ];
  return <section className={`${source.section} next-profile-settings-groups`}
    aria-label="Настройки аккаунта" data-next-profile-settings>
    <div className={source.buttonsContainer}>
      <div className={source.settingsColumn}>
        <div className={source.notificationPanel}>
          <LegacyNotificationStatus ownerId={profile?.id} />
        </div>
        <Group title="Данные аккаунта">
          {account.map(item=><InternalRow key={item.to} item={item}/>)}
        </Group>
        <Group title="Настройки">
          <InternalRow item={{label:"Напоминания о тренировках",to:"/reminders",icon:"reminders"}}/>
          <button type="button" className={`${source.row} next-profile-settings-row`}
            onClick={()=>{if(profile?.id)restartProfileTour(profile.id);}}>
            <NextProfileIcon name="tour"/><span>Повторить экскурсию</span>
            <span aria-hidden="true">›</span>
          </button>
          {profile?.hasVkLinked && <div className={source.vkLinkedBadge}>
            <NextProfileIcon name="login"/><span>VK подключён</span>
          </div>}
        </Group>
      </div>
      <div className={source.settingsColumn}>
        <Group title="Информация">
          {information.map(item=><ExternalRow key={item.href} item={item}/>)}
          <button type="button" className={`${source.row} next-profile-settings-row`}
            onClick={() => resetCookieConsent()}>
            <NextProfileIcon name="privacy"/><span>Управление cookies</span>
            <span aria-hidden="true">›</span>
          </button>
        </Group>
        <Group title="Действия с аккаунтом">
          <button type="button" className={`${source.row} next-profile-settings-row`}
            onClick={()=>logout.mutate()} disabled={logout.isPending}>
            <NextProfileIcon name="logout"/><span>Выйти из аккаунта</span>
          </button>
          {logout.isError && <p role="alert">Не удалось выйти. Повторите попытку.</p>}
          <LogoutAllSessionsAction />
          <RouteLink to="/profile/delete-account"
            className={`${source.row} ${source.dangerRow} next-profile-settings-row`}>
            <NextProfileIcon name="delete-account"/><span>Удалить аккаунт</span>
            <span aria-hidden="true">›</span>
          </RouteLink>
        </Group>
      </div>
    </div>
  </section>;
}
