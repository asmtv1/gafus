/** Original landing artwork, text and unmodified CSS from apps/web/src/app/page.tsx. */
import { RouteLink } from "../shared/router/location";
import styles from "./PublicLanding.module.css";
import button from "./LegacyPrimaryButton.module.css";
import {LandingMaterialIcon} from "./LandingMaterialIcons";
import {useEffect,useState} from "react";
import {apiRequest} from "../shared/api/client";
import {LandingVkEntry,LandingVkErrorBanner} from "./LandingVkEntry";
const concerns=["На прогулке контакт быстро теряется","Непонятно, за что взяться сначала",
  "Советы есть. Порядка действий нет","Собака не может оставаться дома одна",
  "Постоянно тянет поводок","Подбирает всё подряд с земли"];
const pathItems=[
 {title:"Пошаговую систему",text:"Понятный путь вместо разрозненных уроков: от первой задачи к устойчивому навыку.",icon:"AccountTreeRounded"},
 {title:"Практические навыки",text:"Большинство занятий - не голая теория, а отработка практических навыков в реальной жизни.",icon:"CalendarMonthRounded"},
 {title:"Позитивные методы",text:"Без запугивания, рывков и строгих ошейников. Собака учится через положительное подкрепление.",icon:"TrendingUpRounded"},
 {title:"Всё в одном месте",text:"Помимо курсов, храните документы хвостика, ставьте напоминания и делайте записи о процедурах — всё это бесплатно.",icon:"AppsRounded"},
 {title:"Мобильное приложение",text:"Занимайтесь там, где вам удобно: дома, на прогулке или в дороге — без привязки к компьютеру и интернету.",icon:"PhoneIphoneRounded"},
] as const;
const expertHighlights=["Член ассоциации поведенческой медицины RVBA",
 "Сертифицированный специалист Fear Free: без боли и стресса",
 "Основатель и руководитель сервиса Campdog",
 "Лектор самарских информационных площадок и газет",
 "Участвует в приютских мероприятиях и обучает детей в центрах"];
const plans=[
 {name:"Самостоятельный",price:"1 185",tone:styles.planTrial,promo:false,note:"30 дней занятий в своём темпе",
  features:["Доступ к курсам и пошаговым занятиям","Практика дома и на прогулках","Весь бесплатный функционал"],supportNote:null},
 {name:"Поддержка в чате",price:"1 465",tone:styles.planPopular,promo:true,note:"30 дней занятий с поддержкой кинолога",
  features:["Всё, что есть в тарифе «Самостоятельный»","Чат с кинологом","Скачивание курсов без интернета"],
  supportNote:{title:"Кинолог рядом.",text:"Можно написать специалисту, если нужна поддержка в занятиях."}},
 {name:"Полное сопровождение",price:"2 470",tone:styles.planSteady,promo:true,
  note:"30 дней занятий с чатом и консультациями",
  features:["Всё, что есть в тарифе «Поддержка в чате»","Запись на видеоконсультацию с кинологом"],supportNote:null}
];
function Heading({lines,mobileLines}:{lines:string[];mobileLines?:string[]}) {
 const render=(items:string[],cls:string)=><span className={cls}>
  {items.map(line=><span key={line} className={styles.titleLine}>{line}</span>)}
 </span>;
 return <>{render(lines,`${styles.titleLines}${mobileLines?` ${styles.titleLinesDesktop}`:""}`)}
  {mobileLines&&render(mobileLines,styles.titleLinesMobile)}</>;
}
function Action({href,children,large=false,className}:{href:string;children:string;
 large?:boolean;className?:string}){
 const cls=[button.root,large?button.large:undefined,className].filter(Boolean).join(" ");
 return href.startsWith("#")?<a href={href} className={cls}>{children}</a>:
  <RouteLink to={href as "/register"|"/login"} className={cls}>{children}</RouteLink>;
}
/** The only guest content on `/`. This source-page aggregate intentionally
 * fails open: no invented count is displayed if the read-only public API fails. */
export function PublicLanding({loadStats=true}: {loadStats?:boolean}={}){
 const [students,setStudents]=useState<number|null>(null);
 useEffect(()=>{
   // Hold the anonymous aggregate until auth resolves. A signed-in visitor
   // redirects to /courses without an unnecessary guest stats request.
   if(!loadStats)return;
   let mounted=true;
   // A public aggregate does not belong in the authenticated private query
   // cache: guest /me cleanup intentionally clears all non-auth queries.
   void apiRequest<unknown>("/api/v1/public/platform-stats",{method:"GET"})
    .then(data=>{
      if(!mounted||typeof data!=="object"||data===null||!("students" in data))return;
      const count=(data as {students:unknown}).students;
      if(typeof count==="number"&&Number.isSafeInteger(count)&&count>0)
        setStudents(count);
    }).catch(()=>undefined); // Same fail-open behavior as Next server render.
   return()=>{mounted=false;};
 },[loadStats]);
 const studentCount=students ? new Intl.NumberFormat("ru-RU").format(students) : null;
 return <div className={`${styles.page} gafus-public-landing`}
 data-ui-parity="legacy-landing">
 <section className={styles.hero} aria-labelledby="welcome-title">
  <div className={styles.heroPhotoWrap}><div className={styles.artFrame}>
   <img className={styles.heroPhoto} src="/images/gafus-landing-target-v2.webp"
    alt="Гафус приглашает начать занятие" width="2400" height="1600" />
  </div></div>
  <header className={styles.header}>
   <a className={styles.wordmark} href="/" aria-label="Гафус, на главную">
    <img className={styles.wordmarkImage} src="/images/gafus-logo-mascot.webp"
     width="144" height="96" alt="Гафус" /></a>
   <nav className={styles.nav} aria-label="Основная навигация">
    <Action href="/register" className={styles.navAction}>Начать заниматься</Action>
    <Action href="/login" className={styles.navAction}>Войти</Action>
   </nav>
  </header>
  <LandingVkErrorBanner/>
  <div className={styles.heroLayout}><div className={styles.heroCopy}>
   <div className={styles.sectionIntro}>
    <h1 id="welcome-title"><Heading lines={["ГАФУС -","Уверенность","в каждом шаге!"]}/></h1>
    <p>Лёгкое обучение начинается с понятной программы.<br/>В ГАФУСе вы всегда понимаете,
     какой<br/>результат ожидать сегодня и что делать завтра.</p>
   </div>
   <Action href="#concerns" className={styles.heroAction} large>Как это работает?</Action>
  </div></div>
 </section>
 <section id="concerns" className={styles.concernsBand} aria-labelledby="concerns-title">
  <div className={styles.concernsBackdrop} aria-hidden="true"><img
   src="/images/gafus-landing-map-v2.webp" alt="" className={styles.concernsBackdropImage}/></div>
  <div className={styles.concerns}><div className={styles.concernsContent}>
   <div className={styles.concernsTitle}><div className={styles.sectionIntro}>
    <h2 id="concerns-title"><Heading lines={["От проблемы","к результату."]}/></h2>
    <p>Не нужно самостоятельно искать советы и пытаться собрать из них систему.
     <br/>В ГАФУСе вас ждет готовый пошаговый план под любую проблему.
     Просто выберите нужный курс.</p>
   </div></div>
   <ul className={styles.concernList}>{concerns.map(text=><li key={text}>{text}</li>)}
    <li className={styles.concernNote}>Отдельные программы для лая, тревожности,
     перевозбуждения, агрессии и других сложностей...</li></ul>
   <div className={styles.sectionFooter}><Action href="#path" className={styles.sectionAction}>
    А почему именно ГАФУС?</Action></div>
  </div></div>
 </section>
 <section id="path" className={styles.path} aria-labelledby="path-title">
  <div className={styles.pathBackdrop} aria-hidden="true"><img
   src="/images/gafus-landing-plan-v2.webp" alt="" className={styles.pathBackdropImage}/></div>
  <div className={styles.pathHeader}><div className={styles.pathCopy}>
   <h2 id="path-title"><Heading lines={["В ГАФУС","Мы заморочились","над всем!"]}/></h2>
   <p className={styles.pathIntro}>От структуры занятий до мобильного приложения
    и напоминаний — чтобы вам оставалось только заниматься с собакой.</p>
  </div></div>
  <div className={styles.pathCards}>{pathItems.map(item=><article
   className={styles.pathCard} key={item.title}>
   <LandingMaterialIcon name={item.icon} className={styles.pathCardIcon}/>
   <div><h3>{item.title}</h3><p>{item.text}</p></div>
  </article>)}</div>
  <div className={styles.sectionFooter}><Action href="#expert" className={styles.sectionAction}>
   А кто автор курсов?</Action></div>
 </section>
 <section id="expert" className={styles.expertSection} aria-labelledby="support-title">
  <div className={styles.expertBackdrop} aria-hidden="true"><img
   src="/images/gafus-landing-expert-v1.webp" className={styles.expertBackdropImage} alt=""/></div>
  <div className={styles.expertSupportLead}>
   <div className={`${styles.expertSupport} ${styles.sectionIntro} ${styles.introInverse}`}>
    <h2 id="support-title"><Heading lines={["Не советы из интернета,","а система от кинолога."]}
     mobileLines={["Не советы из","интернета, а система","от кинолога."]}/></h2>
    <p>Курсы разработаны профессиональным специалистом.</p>
   </div>
   <div className={styles.expertSupportArt}><img src="/images/gafus-cynologist-support.webp"
    alt="Кинолог и Гафус" width="320" height="341"/></div>
  </div>
  <div className={styles.expert} aria-labelledby="expert-title">
   <div className={styles.expertPortraitWrap}>
    <div className={styles.expertArt}><div className={styles.artFrame}>
     <img src="/images/lana-petrenko.webp" alt="Лана Петренко"
      width="800" height="800" className={styles.expertPortrait}/>
    </div></div>
    <p className={styles.expertPortraitNote}>Доброта - часть метода</p>
   </div>
   <div className={styles.expertCopy}>
    <h3 id="expert-title"><Heading lines={["Лана Петренко"]}/></h3>
    <p className={styles.expertLead}>Специалист по поведению и благополучию собак и кошек.
     Помогает выстраивать занятия эффективно, понятно и с вниманием к состоянию животного.</p>
    <ul className={styles.expertHighlights}>{expertHighlights.map(x=><li key={x}>{x}</li>)}</ul>
   </div>
  </div>
  <div className={styles.sectionFooter}><Action href="#pricing" className={styles.sectionAction}>
   А какая цена?</Action></div>
 </section>
 <section id="pricing" className={styles.pricing} aria-labelledby="pricing-title">
  <div className={styles.pricingStage}>
   <div className={styles.pricingBackdrop} aria-hidden="true"><img
    src="/images/gafus-landing-pricing-v1.webp" className={styles.pricingBackdropImage} alt="" /></div>
   <div className={styles.pricingLead}><div className={`${styles.pricingCopy} ${styles.sectionIntro}`}>
    <h2 id="pricing-title"><Heading lines={["Не десятки тысяч,","а по адекватной цене."]}
     mobileLines={["Не десятки тысяч,","а по адекватной","цене."]}/></h2>
    <p>Весь функционал ГАФУС — дешевле одной личной встречи с кинологом.<br/>
     И большинства онлайн-курсов.</p>
   </div></div>
   <div className={styles.pricingPanel}>
    <div className={styles.pricingGrid}>{plans.map(plan=><article key={plan.name}
     className={`${styles.planCard} ${plan.tone}`}>
     <p className={styles.planName}>{plan.name}</p>
     <p className={styles.planPrice} aria-describedby="pricing-promo-note">
       {plan.price} <span>₽</span>{plan.promo&&<sup aria-hidden="true">*</sup>}
     </p>
     <p className={styles.planPeriod}>{plan.note}</p>
     <ul>{plan.features.map(x=><li key={x}>
       <LandingMaterialIcon name="CheckRounded"/><span>{x}</span></li>)}</ul>
     {plan.supportNote&&<div className={styles.planSupportNote}>
       <strong>{plan.supportNote.title}</strong><span>{plan.supportNote.text}</span>
     </div>}
    </article>)}</div>
    <p className={styles.promoNote} id="pricing-promo-note">
     <span className={styles.promoStar} aria-hidden="true">*</span>
     <span><strong>На тарифы «Поддержка в чате» и «Полное сопровождение»
      доступна скидка по промокоду.</strong>{" "}Промокод ищите в наших соцсетях.</span>
    </p>
   </div>
   <div className={styles.sectionFooter}><Action href="#invitation" className={styles.sectionAction}>
    А где скачать приложение?</Action></div>
  </div>
 </section>
 <section id="invitation" className={styles.invitation} aria-labelledby="invitation-title">
  <div className={styles.invitationBackdrop} aria-hidden="true"><img
   src="/images/gafus-landing-final-v1.webp" className={styles.invitationBackdropImage} alt=""/></div>
  <div className={styles.invitationCopy}>
   <div className={styles.sectionIntro}>
    <h2 id="invitation-title"><Heading lines={["Поведение мечты -","от тебя","в одном клике."]}/></h2>
    <p>И этот клик - регистрация.</p>
   </div>
   {studentCount&&<p className={styles.studentCount}
     aria-label={`С нами уже учатся ${studentCount} хвостиков`}>
     <span aria-hidden="true">С нами уже учатся</span>
     <strong aria-hidden="true"><span>{studentCount}</span> хвостиков</strong>
   </p>}
   <div className={styles.downloadPanel} aria-label="Скачать приложение GAFUS">
    <p>Присоединяйся и ты!</p>
    <div className={styles.storeLinks}>
     <a href="https://apps.apple.com/ru/app/gafus/id6760964612" target="_blank" rel="noreferrer">
      <img src="/download-on-app-store.svg" alt="Загрузите GAFUS в App Store"
       width="180" height="60"/></a>
     <a href="https://www.rustore.ru/catalog/app/ru.gafus.app" target="_blank" rel="noreferrer">
      <img src="/download-from-rustore.svg" alt="Скачайте GAFUS из RuStore"
       width="167" height="60"/></a>
    </div>
   </div>
   <div className={styles.authPanel}>
    <p className={styles.browserPrompt}>Или начните в браузере</p>
    <Action href="/register" className={styles.joinAction} large>Начать заниматься</Action>
    <LandingVkEntry/>
   </div>
  </div>
 </section>
 </div>;
}
