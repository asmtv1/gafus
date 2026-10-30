import { Loading } from "../../shared/ui";
import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {ApiError} from "../../shared/api/client";
import {RouteLink} from "../../shared/router/location";
import {displaySubscriptionDate,planLabel,projectSubscriptionSnapshot,
  type SubscriptionReadLoader,type SubscriptionPlan} from "./subscriptionReadMock";
import {PrimaryButton} from "../../shared/ui";
const rub=(n:number)=>new Intl.NumberFormat("ru-RU",{style:"currency",
  currency:"RUB",maximumFractionDigits:0}).format(n);
function err(e:unknown){
  if(e instanceof ApiError){
    if(e.status===401)return "Сессия завершена. Войдите снова.";
    if(e.status===403)return "Просмотр подписки недоступен.";
  }
  return "Не удалось загрузить сведения о подписке.";
}
function Plan({plan}:{plan:SubscriptionPlan}){
  const [open,setOpen]=useState(false);
  return <article className="subscription-plan-card">
    <h4>{plan.title}</h4>
    <p className="subscription-amount">{rub(plan.priceRub)}
      <span className="note"> / {plan.intervalDays} дней</span></p>
    {plan.badge&&<p className="subscription-badge">{
      plan.badge==="POPULAR"?"Популярный":plan.badge==="MAX_SAVINGS"?"Выгодно":"Пробный"}</p>}
    <p className="note">{plan.label}</p>
    <button className="button-secondary" type="button" aria-expanded={open}
      onClick={()=>setOpen(x=>!x)}>{open?"Скрыть возможности":"Что входит"}</button>
    {open&&<ul>
      <li>Чат с кинологом: {plan.cynologistChatIncluded?"Включён":"Не включён"}</li>
      <li>Запись на консультацию: {plan.consultationBookingIncluded?"Включена":"Не включена"}</li>
    </ul>}
  </article>;
}
/** Source-only: GET /status may reconcile YooKassa, GET /offer
 * may ensure/create Apple token. Neither is invoked here. */
export function SubscriptionReadPanel({userId,loadSnapshot}:{
  userId:string;loadSnapshot:SubscriptionReadLoader;
}){
  const q=useQuery({queryKey:["subscription","source-fixture",userId],
    queryFn:async()=>projectSubscriptionSnapshot(await loadSnapshot(userId)),
    retry:false,staleTime:0,gcTime:0});
  return <section className="subscription-readonly" aria-label="Моя подписка">
    <header className="subscription-heading">
      <h2>Моя подписка</h2><RouteLink to="/profile">Мой профиль</RouteLink>
    </header>
    <p className="subscription-source-banner" role="status">
      Демонстрационный просмотр. Оплата и управление подпиской недоступны.
    </p>
    {q.isPending&&<Loading message="Загружаем данные подписки…" />}
    {q.isError&&<div role="alert"><p>{err(q.error)}</p>
      <PrimaryButton type="button" onClick={()=>void q.refetch()}>Повторить</PrimaryButton>
    </div>}
    {q.isSuccess&&<>
      <section className="subscription-current" aria-label="Текущий доступ">
        <h3>Ваш доступ</h3>
        <p className="subscription-state" role="status">
          {q.data.status.hasActiveSubscription?
            q.data.status.isLifetime?"Пожизненный доступ":
            q.data.status.isTrial?"Пробная подписка":"Подписка активна":
            "Сейчас нет активной подписки"}</p>
        {q.data.status.hasActiveSubscription&&
          <p>Тариф: <strong>{planLabel(q.data.status.planCode)}</strong></p>}
        {q.data.status.activeUntil&&!q.data.status.isLifetime&&
          <p>Доступ до: <time dateTime={q.data.status.activeUntil}>
            {displaySubscriptionDate(q.data.status.activeUntil)}</time></p>}
        {q.data.status.nextChargeAt&&!q.data.status.cancelAtPeriodEnd&&
          <p>Следующее списание: <time dateTime={q.data.status.nextChargeAt}>
            {displaySubscriptionDate(q.data.status.nextChargeAt)}</time></p>}
        {q.data.status.cancelAtPeriodEnd&&<p>Автопродление отключено.</p>}
        <ul className="subscription-benefits">
          <li>Чат с кинологом: {q.data.status.canUseCynologistChat?"Включён":"Не включён"}</li>
          <li>Запись на консультацию: {q.data.status.canBookConsultations?"Включена":"Не включена"}</li>
        </ul>
      </section>
      <section aria-label="Доступные тарифы">
        <h3>Тарифы</h3>
        {q.data.offer.plans.length===0?
          <p className="empty-state" role="status">Тарифы сейчас недоступны.</p>:
          <div className="subscription-plan-grid">
            {q.data.offer.plans.map(p=><Plan plan={p} key={p.code}/>)}
          </div>}
        {q.data.offer.savedPromoStatus&&
          q.data.offer.savedPromoStatus!=="ACTIVE"&&
          <p className="note">Ранее сохранённый промокод больше не действует.</p>}
        {q.data.offer.promoAvailable&&
          <p className="note">Промокод и оплата требуют отдельного допуска.</p>}
      </section>
    </>}
  </section>;
}
