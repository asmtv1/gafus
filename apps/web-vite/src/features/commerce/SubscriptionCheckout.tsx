import { Loading } from "../../shared/ui";
import { useEffect,useMemo,useRef,useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { RouteLink,navigate,type RoutePath } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import { createCheckoutPayment,getCheckoutOffer,getCheckoutStatus,previewCheckoutPromo,validatedCheckoutPlans,type CheckoutPlan,type PromoPreview } from "./checkoutApi";
import "./SubscriptionCheckout.css";

const rub=(n:number)=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:2}).format(n);
const sbpPrice=(amount:number)=>new Intl.NumberFormat("ru-RU",{
  minimumFractionDigits:Number.isInteger(amount)?0:2,maximumFractionDigits:2,
}).format(amount).replace(/\s/g," ")+" ₽";
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

const PLAN_SUBTITLES: Record<CheckoutPlan["code"], string> = {
  TWO_WEEKS: "Для самостоятельных занятий в своём темпе",
  MONTHLY: "Обучение с поддержкой кинолога в чате",
  THREE_MONTHS: "Все возможности и запись к специалисту",
};
const PLAN_FEATURES: {title:string;detail:string;included:(plan:CheckoutPlan)=>boolean}[]=[
  {title:"Курсы и практические шаги",detail:"Обучающие программы и упражнения",included:()=>true},
  {title:"Статьи и материалы",detail:"Полезные публикации для владельцев собак",included:()=>true},
  {title:"Обучение офлайн",detail:"Скачивание курсов в мобильном приложении",included:plan=>plan.offlineCourseDownloadIncluded===true},
  {title:"Чат с кинологом",detail:"Общение со специалистом в переписке",included:plan=>plan.cynologistChatIncluded===true},
  {title:"Запись на консультации",detail:"Возможность выбрать свободное время",included:plan=>plan.consultationBookingIncluded===true},
];

/** Next checkout semantics, using Hono/Core authority for offers, promos and access. */
export function SubscriptionCheckout({ownerId,search="",embedded=false,context="general",returnPath}:{
  ownerId:string;search?:string;embedded?:boolean;context?:"general"|"consultation";returnPath?:string;
}){
  const consultation=context==="consultation";
  const cache=useQueryClient();
  const [selected,setSelected]=useState<CheckoutPlan["code"]|null>(null);
  const [promoInput,setPromoInput]=useState("");
  const [promo,setPromo]=useState<PromoPreview|null>(null);
  const [promoMessage,setPromoMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [returnState,setReturnState]=useState<"checking"|"success"|"pending">("checking");
  const inFlight=useRef(false);
  const promoSeq=useRef(0);
  const paidReturn=new URLSearchParams(search).get("paid")==="1";
  const offer=useQuery({queryKey:["checkout",ownerId,"offer"],queryFn:getCheckoutOffer,
    enabled:!paidReturn,retry:false,staleTime:0,gcTime:0});
  const status=useQuery({queryKey:["checkout",ownerId,"status"],queryFn:getCheckoutStatus,
    enabled:!paidReturn,retry:false,staleTime:0,gcTime:0});
  const checked=useMemo(()=>{
    try {return {plans:offer.data?validatedCheckoutPlans(offer.data):[],error:null};}
    catch{return {plans:[],error:"Сервер вернул некорректное предложение подписки."};}
  },[offer.data]);
  const plans=checked.plans;
  const chosen=consultation
    ? plans.find(p=>p.code==="THREE_MONTHS"&&p.consultationBookingIncluded===true)??null
    : plans.find(p=>p.code===selected)??plans.find(p=>p.code==="MONTHLY")??plans[0]??null;
  const promoVisible=!!chosen&&(chosen.code==="MONTHLY"||chosen.code==="THREE_MONTHS")&&
    chosen.promoCodeEligible&&offer.data?.promoCode?.entryEnabled===true&&
    offer.data.promoCode.eligible===true;
  const active=status.data?.hasActiveSubscription===true;

  useEffect(()=>{
    if(!paidReturn)return;
    let cancelled=false;setReturnState("checking");
    const check=async()=>{
      for(let i=0;i<8&&!cancelled;i++){
        try {
          const verified=await getCheckoutStatus();
          if(cancelled)return;
          if(verified?.hasActiveSubscription===true){
            setReturnState("success");
            void cache.invalidateQueries({queryKey:["profile","subscription",ownerId]});
            await sleep(2000);
            if(!cancelled){
              if(consultation)void cache.invalidateQueries({queryKey:["consult-live"]});
              const destination=consultation&&returnPath&&
                /^\/consultations\/[A-Za-z0-9_-]{1,128}$/.test(returnPath)
                  ? returnPath as RoutePath : "/courses";
              navigate(destination);
            }
            return;
          }
        } catch { /* Webhook may not yet have confirmed access. */ }
        if(i<7)await sleep(1500);
      }
      if(!cancelled)setReturnState("pending");
    };
    void check();return()=>{cancelled=true;};
  },[paidReturn,ownerId,cache,consultation,returnPath]);

  useEffect(()=>{
    const saved=offer.data?.savedRegistrationPromoCode;
    if(!promoVisible||!chosen||!saved||saved.status!=="ACTIVE"||promoSeq.current||promoInput)return;
    const ticket=++promoSeq.current;
    setPromoInput(saved.code);
    void previewCheckoutPromo(chosen,saved.code).then(value=>{
      if(ticket===promoSeq.current){setPromo(value);setPromoMessage(`Промокод ${value.code} применён.`);}
    }).catch(()=>{
      if(ticket===promoSeq.current)setPromoMessage("Сохранённый промокод не подтверждён. Проверьте его или очистите поле.");
    });
  },[promoVisible,chosen,offer.data?.savedRegistrationPromoCode,promoInput]);

  const resetPromo=()=>{promoSeq.current++;setPromo(null);setPromoInput("");setPromoMessage("");setError(null);};
  const applyPromo=async()=>{
    if(!chosen||!promoVisible||inFlight.current)return;
    const code=promoInput.trim().toUpperCase();
    if(!/^[A-Za-z0-9_-]{3,64}$/.test(code)){
      setPromo(null);setPromoMessage("Проверьте формат промокода.");return;
    }
    const ticket=++promoSeq.current;
    setPromo(null);setPromoMessage("Проверяем…");
    try {const value=await previewCheckoutPromo(chosen,code);
      if(ticket===promoSeq.current){setPromo(value);setPromoInput(value.code);setPromoMessage(`Промокод ${value.code} применён.`);}
    } catch(e){if(ticket===promoSeq.current)setPromoMessage(e instanceof ApiError?e.message:"Не удалось проверить промокод.");}
  };
  const pay=async()=>{
    if(!chosen||inFlight.current||active||status.isFetching||
      offer.isFetching||!status.isSuccess)return;
    if(promoVisible&&promoInput.trim()&&(!promo||promo.code!==promoInput.trim().toUpperCase())){
      setError("Сначала примените промокод или очистите поле.");return;
    }
    inFlight.current=true;setBusy(true);setError(null);
    try {const url=await createCheckoutPayment(chosen.code,
      promoVisible?promo??undefined:undefined,consultation?returnPath:undefined);
      window.location.assign(url);
    } catch(e){setError(e instanceof Error?e.message:"Ошибка при создании платежа.");}
    finally{inFlight.current=false;setBusy(false);}
  };

  if(paidReturn)return <section className="subscription-checkout" aria-label="Подтверждение оплаты">
    <div className="subscription-checkout-card" role="status" aria-live="polite">
      <p className="subscription-kicker">Gafus Premium</p>
      <h1>{returnState==="checking"?"Проверяем оплату":returnState==="success"?"Оплата подтверждена":"Оплата ещё подтверждается"}</h1>
      <p>{returnState==="checking"?"Ожидаем подтверждения от ЮKassa.":returnState==="success"?
        consultation?"Подписка подтверждена. Возвращаем к выбору времени.":
          "Premium активен. Открываем курсы.":"Подтверждение пока не поступило. Обновите страницу позже."}</p>
      {returnState==="pending"&&<button type="button" onClick={()=>window.location.reload()}>Проверить снова</button>}
    </div>
  </section>;


  return <section className={"subscription-checkout" +
    (embedded ? " subscription-checkout-embedded" : "") +
    (consultation ? " subscription-checkout-consultation" : "")}
    aria-label="Оформление подписки Gafus Premium">
    <div className="subscription-checkout-card">
      <header className="subscription-checkout-header">
        <span className="subscription-kicker"><span aria-hidden="true">✦</span> GAFUS PREMIUM</span>
        {!embedded && <RouteLink to="/courses">К курсам</RouteLink>}
      </header>
      {consultation ? <div className="consultation-paywall-intro">
        <span className="subscription-overline">ЗАПИСЬ К КИНОЛОГУ</span>
        <h2>Откройте запись на консультацию</h2>
        <p>Выбор свободного времени доступен с тарифом
          <strong> «Полное сопровождение»</strong>.
          После оплаты вы сможете вернуться к записи.</p>
      </div> : <div className="subscription-checkout-intro">
        <span className="subscription-intro-eyebrow">ВАШЕ ОБУЧЕНИЕ С GAFUS</span>
        <h1>Больше понимания. Больше прогресса.</h1>
        <p>Курсы и статьи в каждом тарифе. Поддержка кинолога — когда она нужна.</p>
      </div>}
      {offer.isPending || status.isPending ? <Loading message="Загружаем тарифы и статус…" className="subscription-feedback" /> : null}
      {offer.isError || status.isError ? <div role="alert" className="subscription-feedback">
        <p>Не удалось проверить тарифы или подписку.</p>
        <button type="button" onClick={() => { void offer.refetch(); void status.refetch(); }}>Повторить</button>
      </div> : null}
      {checked.error && <p role="alert" className="subscription-feedback">{checked.error}</p>}
      {active && <p role="status" className="subscription-feedback">
        {consultation?"Текущая подписка не позволяет открыть запись. Смену тарифа можно уточнить у поддержки.":
          "Подписка уже активна. Управление автопродлением доступно в профиле."}
      </p>}
      {offer.isSuccess && !offer.isFetching && !checked.error && !active && plans.length === 0 &&
        <p role="status" className="subscription-feedback">Нет доступных тарифов.</p>}
      {consultation && offer.isSuccess && !checked.error && !chosen && !active &&
        <p role="status" className="subscription-feedback">
          Тариф с записью на консультации сейчас недоступен. Повторите проверку позднее.
        </p>}
      {offer.isSuccess && status.isSuccess && !offer.isFetching && !status.isFetching &&
        !checked.error && !active && chosen && plans.length > 0 && <>
        {!consultation && <><div className="subscription-section-heading">
          <div><span className="subscription-overline">ВЫБОР ПОДПИСКИ</span>
            <h2>Найдите свой тариф</h2>
            <p>Все отличия, преимущества и ограничения — перед вами.</p></div>
          <span className="subscription-period-hint">Цены за период подписки</span>
        </div>
        <div className="subscription-plan-list" role="radiogroup" aria-label="Тарифы подписки">
          {plans.map(plan => {
            const isSelected = chosen?.code === plan.code;
            return <button type="button" role="radio" key={plan.code} aria-checked={isSelected}
              aria-label={plan.title + ", " + rub(plan.yookassaPriceRub) + " за " + plan.intervalDays + " дней"}
              className={"subscription-plan" + (isSelected ? " subscription-plan-selected" : "")}
              onClick={() => { setSelected(plan.code); resetPromo(); }}>
              <span className="subscription-plan-top">
                <span className="subscription-plan-radio" aria-hidden="true">{isSelected ? "✓" : ""}</span>
                {plan.badge && <span className="subscription-plan-badge">{plan.badge==="POPULAR" ? "Популярный выбор" : plan.badge==="MAX_SAVINGS" ? "Выгодный тариф" : "Для начала"}</span>}
              </span>
              <strong className="subscription-plan-title">{plan.title}</strong>
              <span className="subscription-plan-description">{PLAN_SUBTITLES[plan.code]}</span>
              <span className="subscription-plan-price"><strong>{rub(plan.yookassaPriceRub)}</strong><small>за {plan.intervalDays} дней</small></span>
              <span className="subscription-features-label">ВОЗМОЖНОСТИ ТАРИФА</span>
              <span className="subscription-plan-features">
                {PLAN_FEATURES.map(feature => {
                  const included = feature.included(plan);
                  return <span className={"subscription-plan-feature" + (included ? "" : " subscription-feature-disabled")} key={feature.title}>
                    <span className="subscription-feature-icon" aria-hidden="true">{included ? "✓" : "×"}</span>
                    <span className="subscription-feature-copy"><strong>{feature.title}</strong>
                      <small>{included ? feature.detail : "Не входит в тариф"}</small></span>
                  </span>;
                })}
              </span>
              <span className="subscription-plan-choose">
                {isSelected ? "Тариф выбран" : "Выбрать тариф"}<span aria-hidden="true">{isSelected ? "✓" : "→"}</span>
              </span>
            </button>;
          })}
        </div>
        </>}
        <div className="subscription-order">
          {consultation ? <div className="consultation-paywall-plan">
            <div className="consultation-paywall-plan-title">
              <span className="subscription-overline">ПОДХОДЯЩИЙ ТАРИФ</span>
              <h3>{chosen.title}</h3>
              <span>Доступ на {chosen.intervalDays} дней</span>
            </div>
            <div className="consultation-paywall-plan-price">
              <strong>{rub(chosen.yookassaPriceRub)}</strong>
              <small>за {chosen.intervalDays} дней</small>
            </div>
            <ul className="consultation-paywall-included">
              <li>Запись на консультацию к кинологу</li>
              <li>Общение с кинологом в чате</li>
              <li>Курсы, статьи и обучение офлайн</li>
            </ul>
          </div> : <div className="subscription-order-heading">
            <div><span className="subscription-overline">ОФОРМЛЕНИЕ</span>
              <h2>Ваш выбор — {chosen!.title}</h2>
              <p>Доступ на {chosen!.intervalDays} дней после подтверждения оплаты.</p></div>
            <div className="subscription-order-price"><small>К оплате сейчас</small>
              <strong>{rub(promo?.discountedPriceRub ?? chosen!.yookassaPriceRub)}</strong></div>
          </div>}
          {promoVisible && <div className={"subscription-promo" + (promo ? " subscription-promo-applied" : "")}>
            <div className="subscription-promo-header">
              <span className="subscription-promo-symbol" aria-hidden="true">✦</span>
              <div>
                <span className="subscription-promo-eyebrow">ПРИВИЛЕГИЯ ДЛЯ ВАС</span>
                <h3>Промокод на скидку</h3>
                {!promo && <p>Активируйте код, чтобы уменьшить первую оплату.</p>}
              </div>
            </div>
            {offer.data?.savedRegistrationPromoCode && offer.data.savedRegistrationPromoCode.status !== "ACTIVE" &&
              <p role="alert" className="subscription-promo-message">
                Сохранённый при регистрации промокод не действует. Проверьте код перед оплатой.
              </p>}
            {!promo ? <form onSubmit={event => { event.preventDefault(); void applyPromo(); }}>
              <label htmlFor="subscription-promo-code" className="subscription-promo-input-label">Ваш промокод</label>
              <div className="subscription-promo-controls">
                <input id="subscription-promo-code" value={promoInput} maxLength={64} autoComplete="off"
                  placeholder="Введите промокод" onChange={event => {
                    promoSeq.current++; setPromoInput(event.target.value); setPromo(null); setPromoMessage(""); setError(null);
                  }}/>
                <button type="submit" disabled={!promoInput.trim() || busy}>Применить <span aria-hidden="true">→</span></button>
              </div>
            </form> : <div className="subscription-promo-confirmation">
              <div className="subscription-promo-confirmation-label">
                <span className="subscription-promo-check" aria-hidden="true">✓</span>
                <div><strong>Промокод применён</strong><span>{promo.code}</span></div>
              </div>
              <button type="button" className="subscription-promo-change" onClick={resetPromo} disabled={busy}>
                Изменить
              </button>
            </div>}
            {!promo && promoMessage && <p role="alert" className="subscription-promo-message">{promoMessage}</p>}
            {promo && <div className="subscription-promo-result" role="status" aria-live="polite">
              {promo.originalPriceRub > promo.discountedPriceRub && <div className="subscription-promo-savings">
                <span>ВАША ЭКОНОМИЯ НА ПЕРВОЙ ОПЛАТЕ</span>
                <div>
                  <strong>−{rub(promo.originalPriceRub - promo.discountedPriceRub)}</strong>
                  {promo.discountPercent > 0 &&
                    <span className="subscription-promo-percent">−{promo.discountPercent}%</span>}
                </div>
              </div>}
              <div className="subscription-promo-prices">
                <div><span>Обычная цена</span><del>{rub(promo.originalPriceRub)}</del></div>
                <div>
                  <span>Первая оплата</span>
                  <strong>{rub(promo.discountedPriceRub)}</strong>
                </div>
              </div>
              <p className="subscription-promo-renewal">
                Далее при автопродлении:
                {" "}<strong>{rub(promo.renewalPriceRub)} каждые {promo.intervalDays} дней.</strong>
                {" "}Автопродление действует при сохранении способа оплаты.
              </p>
            </div>}
          </div>}
          <button type="button" className="subscription-pay" onClick={() => void pay()} disabled={busy || !chosen}>
            {!busy && <img className="subscription-sbp-logo" src="/images/sbp-logo.svg" alt="" aria-hidden="true"
              width="20" height="25" />}
            <span>{busy ? "Оформляем оплату…" :
              "Оплатить " + sbpPrice(promo?.discountedPriceRub ?? chosen!.yookassaPriceRub) + " по СБП"}</span>
          </button>
          <div className="subscription-payment-caption"><span>✓ Безопасная оплата через ЮKassa</span>
            <span>✓ Отмена автопродления в профиле</span></div>
          <p className="subscription-checkout-legal">
            Нажимая «Оплатить», вы принимаете условия
            <a href="/oferta.html" target="_blank" rel="noopener noreferrer"> оферты</a>.
            При сохранении способа оплаты действует автопродление по цене
            {" "}{rub(promo?.renewalPriceRub ?? chosen!.yookassaPriceRub)} каждые {chosen!.intervalDays} дней.
            Отменить автопродление можно в профиле.
          </p>
        </div>
      </>}
      {error && <p role="alert" className="subscription-checkout-error">{error}</p>}
    </div>
  </section>;
}
