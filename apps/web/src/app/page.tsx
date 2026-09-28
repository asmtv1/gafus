import Image from "next/image";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import AppsRoundedIcon from "@mui/icons-material/AppsRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import PhoneIphoneRoundedIcon from "@mui/icons-material/PhoneIphoneRounded";
import { Suspense } from "react";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";

import { generatePageMetadata } from "@gafus/metadata";
import { prisma, UserRole } from "@gafus/prisma";
import { VkErrorBanner } from "@shared/components/auth/VkErrorBanner";
import { VkIdOneTap } from "@shared/components/auth/VkIdOneTap";
import { PrimaryButtonLink } from "@shared/components/ui";

import styles from "./page.module.css";

export const metadata = generatePageMetadata({
  title: "Гафус - занятия с собакой по понятной системе",
  description:
    "GAFUS помогает заниматься с собакой по шагам: выбирать курсы, выполнять задания, видеть прогресс и получать поддержку кинолога.",
  path: "/",
});

// The counter is public aggregate data, refreshed hourly rather than queried per visitor.
const getPlatformStudentCount = unstable_cache(
  () => prisma.user.count({ where: { role: UserRole.USER } }),
  ["platform-student-count"],
  { revalidate: 60 * 60 },
);

export const revalidate = 3600;

const concerns = [
  "На прогулке контакт быстро теряется",
  "Непонятно, за что взяться сначала",
  "Советы есть. Порядка действий нет",
  "Собака не может оставаться дома одна",
  "Постоянно тянет поводок",
  "Подбирает всё подряд с земли",
];

const pathItems = [
  {
    title: "Пошаговую систему",
    text: "Понятный путь вместо разрозненных уроков: от первой задачи к устойчивому навыку.",
    icon: AccountTreeRoundedIcon,
  },
  {
    title: "Практические навыки",
    text: "Большинство занятий - не голая теория, а отработка практических навыков в реальной жизни.",
    icon: CalendarMonthRoundedIcon,
  },
  {
    title: "Позитивные методы",
    text: "Без запугивания, рывков и строгих ошейников. Собака учится через положительное подкрепление.",
    icon: TrendingUpRoundedIcon,
  },
  {
    title: "Всё в одном месте",
    text: "Помимо курсов, храните документы хвостика, ставьте напоминания и делайте записи о процедурах — всё это бесплатно.",
    icon: AppsRoundedIcon,
  },
  {
    title: "Мобильное приложение",
    text: "Занимайтесь там, где вам удобно: дома, на прогулке или в дороге — без привязки к компьютеру и интернету.",
    icon: PhoneIphoneRoundedIcon,
  },
];

const expertHighlights = [
  "Член ассоциации поведенческой медицины RVBA",
  "Сертифицированный специалист Fear Free: без боли и стресса",
  "Основатель и руководитель сервиса Campdog",
  "Лектор самарских информационных площадок и газет",
  "Участвует в приютских мероприятиях и обучает детей в центрах",
];

const plans = [
  {
    name: "2 недели",
    price: "835",
    showPromoMark: false,
    note: "Чтобы познакомиться с форматом занятий",
    features: [
      "Доступ к курсам и пошаговым занятиям",
      "Практика дома и на прогулках",
      "Весь бесплатный функционал",
    ],
    tone: "trial",
  },
  {
    name: "1 месяц",
    price: "956",
    showPromoMark: true,
    note: "Полный ритм занятий в своём темпе",
    features: [
      "Всё, что есть в предыдущем тарифе",
      "Полный доступ к курсам и занятиям",
      "Поддержка кинолога и запись на консультацию",
      "Скачивание курсов без интернета",
    ],
    supportNote: {
      title: "Кинолог всегда рядом.",
      text: "Можно написать специалисту или разобрать ситуацию на созвоне, если нужна поддержка.",
    },
    tone: "popular",
  },
  {
    name: "3 месяца",
    price: "2 396",
    showPromoMark: true,
    note: "Чтобы идти к устойчивому результату в своём темпе",
    features: [
      "Всё, что есть в предыдущих тарифах — только ещё выгоднее",
      "Доступ к программе на весь период",
    ],
    tone: "steady",
  },
];

function UnderlinedHeading({
  lines,
  mobileLines,
}: {
  lines: string[];
  mobileLines?: string[];
}) {
  const renderLines = (items: string[], className: string) => (
    <span className={className}>
      {items.map((line) => (
        <span className={styles.titleLine} key={line}>
          {line}
        </span>
      ))}
    </span>
  );

  return (
    <>
      {renderLines(lines, `${styles.titleLines}${mobileLines ? ` ${styles.titleLinesDesktop}` : ""}`)}
      {mobileLines ? renderLines(mobileLines, styles.titleLinesMobile) : null}
    </>
  );
}

export default async function AuthPage() {
  let platformStudentCount: number | null = null;

  try {
    platformStudentCount = await getPlatformStudentCount();
  } catch {
    // A transient database problem must not take the landing page offline.
  }

  const formattedStudentCount = platformStudentCount
    ? new Intl.NumberFormat("ru-RU").format(platformStudentCount)
    : null;

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="welcome-title">
        <div className={styles.heroPhotoWrap}>
          <div className={styles.artFrame}>
            <Image
              src="/uploads/site/web/ddfd260bcfdf3386-gafus-landing-target-v2.webp"
              alt="Гафус приглашает начать занятие"
              className={styles.heroPhoto}
              width={2400}
              height={1600}
              priority
              sizes="100vw"
            />
          </div>
        </div>
        <header className={styles.header}>
          <Link className={styles.wordmark} href="/" aria-label="Гафус, на главную">
            <Image
              src="/uploads/site/web/56253ba39b23eef1-gafus-logo-mascot.webp"
              alt="Гафус"
              className={styles.wordmarkImage}
              width={144}
              height={96}
              priority
            />
          </Link>
          <nav className={styles.nav} aria-label="Основная навигация">
            <PrimaryButtonLink className={styles.navAction} href="/register">
              Начать заниматься
            </PrimaryButtonLink>
            <PrimaryButtonLink className={styles.navAction} href="/login">
              Войти
            </PrimaryButtonLink>
          </nav>
        </header>

        <Suspense fallback={null}>
          <VkErrorBanner />
        </Suspense>
        <div className={styles.heroLayout}>
          <div className={styles.heroCopy}>
            <div className={styles.sectionIntro}>
            <h1 id="welcome-title">
              <UnderlinedHeading lines={["ГАФУС -", "Уверенность", "в каждом шаге!"]} />
            </h1>
            <p>
              Лёгкое обучение начинается с понятной программы.
              <br />
              В ГАФУСе вы всегда понимаете, какой
              <br />
              результат ожидать сегодня и что делать завтра.
            </p>
            </div>
            <PrimaryButtonLink
              href="#concerns"
              prefetch={false}
              className={styles.heroAction}
              size="large"
            >
              Как это работает?
            </PrimaryButtonLink>
          </div>
        </div>
      </section>

      <section id="concerns" className={styles.concernsBand} aria-labelledby="concerns-title">
        <div className={styles.concernsBackdrop} aria-hidden="true">
          <Image
            src="/uploads/site/web/6659511aec981ba5-gafus-landing-map-v2.webp"
            alt=""
            className={styles.concernsBackdropImage}
            width={2400}
            height={1600}
            sizes="100vw"
          />
        </div>
        <div className={styles.concerns}>
          <div className={styles.concernsContent}>
            <div className={styles.concernsTitle}>
              <div className={styles.sectionIntro}>
                <h2 id="concerns-title">
                  <UnderlinedHeading lines={["От проблемы", "к результату."]} />
                </h2>
                <p>
                  Не нужно самостоятельно искать советы и пытаться собрать из них систему.
                  <br />В ГАФУсе вас ждет готовый пошаговый план под любую проблему. Просто выберите
                  нужный курс.
                </p>
              </div>
            </div>
            <ul className={styles.concernList}>
              {concerns.map((concern) => (
                <li key={concern}>{concern}</li>
              ))}
              <li className={styles.concernNote}>
                Отдельные программы для лая, тревожности, перевозбуждения, агрессии и других
                сложностей...
              </li>
            </ul>
            <div className={styles.sectionFooter}>
              <PrimaryButtonLink className={styles.sectionAction} href="#path">
                А почему именно ГАФУС?
              </PrimaryButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section id="path" className={styles.path} aria-labelledby="path-title">
        <div className={styles.pathBackdrop} aria-hidden="true">
          <Image
            src="/uploads/site/web/97dbe90fd8bdb08a-gafus-landing-plan-v2.webp"
            alt=""
            className={styles.pathBackdropImage}
            width={2400}
            height={1600}
            sizes="100vw"
          />
        </div>
        <div className={styles.pathHeader}>
          <div className={styles.pathCopy}>
            <h2 id="path-title">
              <UnderlinedHeading lines={["В ГАФУС", "Мы заморочились", "над всем!"]} />
            </h2>
            <p className={styles.pathIntro}>
              От структуры занятий до мобильного приложения и напоминаний — чтобы вам оставалось
              только заниматься с собакой.
            </p>
          </div>
        </div>
        <div className={styles.pathCards}>
          {pathItems.map((item) => (
            <article className={styles.pathCard} key={item.title}>
              <item.icon className={styles.pathCardIcon} aria-hidden="true" />
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
        <div className={styles.sectionFooter}>
          <PrimaryButtonLink className={styles.sectionAction} href="#expert">
            А кто автор курсов?
          </PrimaryButtonLink>
        </div>
      </section>

      <section id="expert" className={styles.expertSection} aria-labelledby="support-title">
        <div className={styles.expertBackdrop} aria-hidden="true">
          <Image
            src="/uploads/site/web/3146d1e0be30c44e-gafus-landing-expert-v1.webp"
            alt=""
            className={styles.expertBackdropImage}
            width={1536}
            height={1024}
            sizes="100vw"
          />
        </div>
        <div className={styles.expertSupportLead}>
          <div className={`${styles.expertSupport} ${styles.sectionIntro} ${styles.introInverse}`}>
            <h2 id="support-title"><UnderlinedHeading
              lines={["Не советы из интернета,", "а система от кинолога."]}
              mobileLines={["Не советы из", "интернета, а система", "от кинолога."]}
            /></h2>
            <p>Курсы разработаны профессиональным специалистом.</p>
          </div>
          <div className={styles.expertSupportArt}>
            <Image
              src="/uploads/site/web/2365dbaf88064da0-gafus-cynologist-support.webp"
              alt="Кинолог и Гафус"
              width={1214}
              height={1295}
              sizes="(max-width: 767px) 70vw, 320px"
            />
          </div>
        </div>
        <div className={styles.expert} aria-labelledby="expert-title">
          <div className={styles.expertPortraitWrap}>
            <div className={styles.expertArt}>
              <div className={styles.artFrame}>
                <Image
                  src="/uploads/site/web/c280a2ddd8b6e2b1-lana-petrenko.webp"
                  alt="Лана Петренко"
                  className={styles.expertPortrait}
                  width={800}
                  height={800}
                  sizes="(max-width: 767px) 78vw, 38vw"
                />
              </div>
            </div>
            <p className={styles.expertPortraitNote}>Доброта - часть метода</p>
          </div>
          <div className={styles.expertCopy}>
            <h3 id="expert-title"><UnderlinedHeading lines={["Лана Петренко"]} /></h3>
            <p className={styles.expertLead}>
              Специалист по поведению и благополучию собак и кошек. Помогает выстраивать занятия
              эффективно, понятно и с вниманием к состоянию животного.
            </p>
            <ul className={styles.expertHighlights}>
              {expertHighlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className={styles.sectionFooter}>
          <PrimaryButtonLink className={styles.sectionAction} href="#pricing">
            А какая цена?
          </PrimaryButtonLink>
        </div>
      </section>

      <section id="pricing" className={styles.pricing} aria-labelledby="pricing-title">
        <div className={styles.pricingStage}>
          <div className={styles.pricingBackdrop} aria-hidden="true">
            <Image
              src="/uploads/site/web/98af082690eec7c9-gafus-landing-pricing-v1.webp"
              alt=""
              className={styles.pricingBackdropImage}
              fill
              sizes="100vw"
              loading="eager"
            />
          </div>
          <div className={styles.pricingLead}>
            <div className={`${styles.pricingCopy} ${styles.sectionIntro}`}>
              <h2 id="pricing-title"><UnderlinedHeading
                lines={["Не десятки тысяч,", "а по адекватной цене."]}
                mobileLines={["Не десятки тысяч,", "а по адекватной", "цене."]}
              /></h2>
              <p>
                Весь функционал ГАФУС — дешевле одной личной встречи с кинологом.
                <br />
                И большинства онлайн-курсов.
              </p>
            </div>
          </div>
        <div className={styles.pricingPanel}>
          <div className={styles.pricingGrid}>
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`${styles.planCard} ${styles[`plan${plan.tone[0].toUpperCase()}${plan.tone.slice(1)}`]}`}
              >
                <p className={styles.planName}>{plan.name}</p>
                <p className={styles.planPrice} aria-describedby="pricing-promo-note">
                  {plan.price} <span>₽</span>
                  {plan.showPromoMark ? <sup aria-hidden="true">*</sup> : null}
                </p>
                <p className={styles.planPeriod}>{plan.note}</p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <CheckRoundedIcon aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.supportNote && (
                  <div className={styles.planSupportNote}>
                    <strong>{plan.supportNote.title}</strong>
                    <span>{plan.supportNote.text}</span>
                  </div>
                )}
              </article>
            ))}
          </div>
          <p className={styles.promoNote} id="pricing-promo-note">
            <span className={styles.promoStar} aria-hidden="true">
              *
            </span>
            <span>
              <strong>Цены на месяц и три месяца — с учётом промокода от наших партнёров.</strong>{" "}
              Промокод ищите в наших соцсетях.
            </span>
          </p>
        </div>
        <div className={styles.sectionFooter}>
          <PrimaryButtonLink className={styles.sectionAction} href="#invitation">
            А где скачать приложение?
          </PrimaryButtonLink>
        </div>
        </div>
      </section>

      <section id="invitation" className={styles.invitation} aria-labelledby="invitation-title">
        <div className={styles.invitationBackdrop} aria-hidden="true">
          <Image
            src="/uploads/site/web/3ca64f7533de718e-gafus-landing-final-v1.webp"
            alt=""
            className={styles.invitationBackdropImage}
            fill
            sizes="100vw"
            loading="eager"
          />
        </div>
        <div className={styles.invitationCopy}>
          <div className={styles.sectionIntro}>
          <h2 id="invitation-title"><UnderlinedHeading lines={["Поведение мечты -", "от тебя", "в одном клике."]} /></h2>
          <p>
            И этот клик - регистрация.
          </p>
          </div>
          {formattedStudentCount && (
            <p className={styles.studentCount} aria-label={`С нами уже учатся ${formattedStudentCount} хвостиков`}>
              <span aria-hidden="true">С нами уже учатся</span>
              <strong aria-hidden="true">
                <span>{formattedStudentCount}</span> хвостиков
              </strong>
            </p>
          )}
          <div className={styles.downloadPanel} aria-label="Скачать приложение GAFUS">
            <p>Присоединяйся и ты!</p>
            <div className={styles.storeLinks}>
              <a
                href="https://apps.apple.com/ru/app/gafus/id6760964612"
                target="_blank"
                rel="noreferrer"
              >
                <Image
                  src="/download-on-app-store.svg"
                  alt="Загрузите GAFUS в App Store"
                  width={180}
                  height={60}
                />
              </a>
              <a
                href="https://www.rustore.ru/catalog/app/ru.gafus.app"
                target="_blank"
                rel="noreferrer"
              >
                <Image
                  src="/download-from-rustore.svg"
                  alt="Скачайте GAFUS из RuStore"
                  width={167}
                  height={60}
                />
              </a>
            </div>
          </div>
          <div className={styles.authPanel}>
            <p className={styles.browserPrompt}>Или начните в браузере</p>
            <PrimaryButtonLink
              href="/register"
              prefetch={false}
              className={styles.joinAction}
              size="large"
            >
              Начать заниматься
            </PrimaryButtonLink>
            <Suspense fallback={null}>
              <VkIdOneTap />
            </Suspense>
          </div>
        </div>
      </section>

    </main>
  );
}
