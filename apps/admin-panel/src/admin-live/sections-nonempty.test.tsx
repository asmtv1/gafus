import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedModerationPanel, QuestionsModerationPanel } from "./ModerationPanels";
import { UsersPanel } from "./UserManagement";
import { PartnersPanel } from "./PartnersPanel";
import { ProfitReport } from "./ProfitReport";
import { SubscriptionPanel } from "./SubscriptionPanels";
import { Bookings, Cynologists } from "./Consultations";
import { ScheduleEditor } from "./ScheduleEditor";
import { GafusPanel } from "./GafusPanel";
import { MobileIntroPanel } from "./MobileIntroPanel";
import { MailPanel } from "./SystemPanels";

const noop = () => undefined;

it("bookings fail closed instead of crashing on a mismatched array response", () => {
  const html = renderToStaticMarkup(<Bookings source={[{ id: "trainer", status: "CONFIRMED" }]} />);
  expect(html).toContain("Некорректный ответ списка бронирований");
});
const time = "2026-10-25T12:00:00.000Z";
const rows = [
  [
    "feed",
    <FeedModerationPanel
      source={{
        pendingCount: 1,
        nextCursor: null,
        items: [
          {
            id: "report-1",
            targetType: "post",
            status: "pending",
            createdAt: time,
            author: { username: "bulldog" },
            reporter: { username: "watcher" },
            reason: "Спам",
            snapshotText: "Содержимое момента",
            comment: "Жалоба",
            resolution: null,
            resolutionReason: null,
          },
        ],
      }}
      onSaved={noop}
    />,
    ["bulldog", "Содержимое момента"],
  ],
  [
    "questions",
    <QuestionsModerationPanel
      source={{
        reports: [
          {
            id: "qreport",
            questionTitle: "Почему тянет поводок?",
            reason: "Спам",
            details: null,
            body: "Текст вопроса",
            createdAt: time,
            author: { name: "Кинолог" },
            reporter: { name: "Другой" },
            answerId: null,
            photos: [],
          },
        ],
        blocks: [{ userId: "user1", name: "Заблокированный", reason: "Спам" }],
        nextPage: 2,
      }}
      onSaved={noop}
    />,
    ["Почему тянет поводок?", "Заблокированный"],
  ],
  [
    "users",
    <UsersPanel
      source={{
        users: [
          {
            id: "u1",
            username: "handler1",
            email: "handler@example.test",
            phone: null,
            createdAt: time,
            role: "USER",
            registrationChannel: "WEB",
            profile: { fullName: "Владелец собаки" },
            _count: { pushSubscriptions: 2 },
            savedRegistrationPromoCode: null,
            partnerProfile: null,
          },
        ],
        freePartnerPromoCodes: [],
      }}
      actorRole="ADMIN"
      actorId="admin"
      onSaved={noop}
    />,
    ["Владелец собаки", "handler@example.test"],
  ],
  [
    "partners",
    <PartnersPanel
      source={[
        {
          id: "partner1",
          username: "creator",
          fullName: "Креатор",
          email: null,
          referralCode: "DOGS10",
          referrals: 3,
          availableRub: 400,
          earnedRub: 600,
          reservedRub: 200,
          availableKopecks: 40000,
          isActive: true,
        },
      ]}
      initialPartnerId={null}
      onSaved={noop}
      onNavigate={noop}
    />,
    ["Креатор", "DOGS10"],
  ],
  [
    "profit",
    <ProfitReport
      source={{
        from: "2026-10-01",
        to: "2026-10-25",
        today: "2026-10-25",
        totals: {
          payments: 120000,
          refunds: 0,
          yookassa: 6000,
          npd: 3000,
          partners: 0,
          videos: 0,
          server: 0,
        },
        profitKopecks: 111000,
        incompletePayments: 0,
        missingFees: 0,
        undatedPayments: 0,
        videos: [
          {
            id: "expense1",
            partnerId: "partner1",
            partnerName: "Креатор",
            paidDay: "2026-10-20",
            quantity: 2,
            amountKopecks: 400,
            comment: "Обработка",
            canceled: false,
            version: 1,
          },
        ],
        videoCount: 1,
        videoPage: 1,
        payments: [
          {
            id: "pay1",
            date: time,
            amountKopecks: 120000,
            method: "bank_card",
            feeKopecks: 6000,
            npdKopecks: 3000,
            complete: true,
          },
        ],
        paymentCount: 1,
        paymentPage: 1,
        pageSize: 20,
        partners: [],
      }}
    />,
    ["Креатор", "Банковская карта"],
  ],
  [
    "promo",
    <SubscriptionPanel
      source={{
        role: "ADMIN",
        dashboard: null,
        paymentHistory: null,
        npd: null,
        promoCodes: [
          {
            id: "promo1",
            code: "DOGS25",
            discountPercent: 25,
            isActive: true,
            archivedAt: null,
            revision: 1,
            createdAt: time,
            updatedAt: time,
            events: [],
          },
        ],
      }}
      tab="promo-codes"
      canManage
      onSaved={noop}
    />,
    ["DOGS25", "25%"],
  ],
  [
    "npd",
    <SubscriptionPanel
      source={{
        role: "ADMIN",
        dashboard: null,
        paymentHistory: null,
        promoCodes: null,
        npd: {
          backlog: 1,
          page: 1,
          pageSize: 25,
          total: 1,
          connection: { status: "AUTHORIZED" },
          items: [
            {
              id: "receipt1",
              paymentId: "payment1",
              user: {
                username: "client1",
                fullName: "Клиент",
              },
              amountRub: 100,
              currency: "RUB",
              status: "RECONCILIATION_REQUIRED",
              planCode: "MONTHLY",
              emailDelivery: "SENT",
              operationAt: time,
              printUrl: null,
            },
          ],
        },
      }}
      tab="npd"
      canManage
      onSaved={noop}
    />,
    ["Клиент", "Сверка"],
  ],
  [
    "payments",
    <SubscriptionPanel
      source={{
        role: "ADMIN",
        dashboard: {},
        promoCodes: null,
        npd: null,
        paymentHistory: {
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
          items: [
            {
              id: "payment1",
              user: {
                username: "client1",
                fullName: "Покупатель",
                email: null,
                phone: null,
              },
              provider: "YOOKASSA",
              kind: "FIRST",
              status: "SUCCEEDED",
              planCode: "MONTHLY",
              promoCodeSnapshot: "DOGS10",
              promoDiscountPercent: 10,
              amountRub: 1465,
              currency: "RUB",
              yookassaPaymentId: "y1",
              failureReason: null,
              succeededAt: time,
              createdAt: time,
            },
          ],
        },
      }}
      tab="payments"
      canManage
      onSaved={noop}
    />,
    ["Покупатель", "DOGS10"],
  ],
  [
    "bookings",
    <Bookings
      source={[
        {
          id: "b1",
          status: "CONFIRMED",
          cynologistUserId: "trainer1",
          cynologistDisplayName: "Наш кинолог",
          clientUsername: "client1",
          clientOwnerName: "Собачник",
          petName: "Шарик",
          slot: { startAtUtc: time, endAtUtc: "2026-10-25T12:30:00Z" },
          confirmationDeadlineAt: time,
          createdAt: time,
        },
      ]}
    />,
    ["Наш кинолог", "Шарик"],
  ],
  [
    "consultations",
    <Cynologists
      source={[
        {
          userId: "trainer1",
          username: "trainer",
          fullName: "Кинолог",
          avatarUrl: "https://cdn.example.test/trainer.jpg",
          about: "Воспитание собак",
          isListed: true,
          cynologistId: "c1",
        },
      ]}
      onSaved={noop}
    />,
    ["Кинолог", "В каталоге", "cdn.example.test/trainer.jpg"],
  ],
  [
    "schedules",
    <ScheduleEditor
      trainerId="trainer1"
      source={{
        availability: {
          slotDurationMin: 30,
          rules: [
            { id: "rule1", weekday: 1, startTime: "10:00", endTime: "14:00", isWorkingDay: true },
          ],
          dayOffs: [{ id: "day1", date: "2026-10-26", reason: "Выходной" }],
          exceptions: [
            { id: "ex1", startAtUtc: time, endAtUtc: "2026-10-25T13:00:00Z", reason: "Встреча" },
          ],
        },
        editableSlots: [
          { id: "slot1", status: "FREE", startAtUtc: time, endAtUtc: "2026-10-25T12:30:00Z" },
        ],
      }}
      onSaved={noop}
    />,
    ["Выходной", "Встреча"],
  ],
  [
    "intro",
    <MobileIntroPanel
      data={{
        timeZone: "Europe/Samara",
        range: { start: "2026-10-01", end: "2026-10-25" },
        generatedAt: time,
        openings: 34,
        completed: 30,
        skipped: 4,
        registered: 10,
        loggedIn: 5,
        pendingAuth: 19,
      }}
      range={{ startDate: "2026-10-01", endDate: "2026-10-25" }}
      onApply={noop}
    />,
    ["Зарегистрировались", "10"],
  ],
  [
    "mail",
    <MailPanel
      data={{
        updatedAt: time,
        summary: {
          attention: 1,
          pending: 2,
          processing: 0,
          sent24h: 5,
          unknown: 1,
          failed: 0,
          expired: 0,
          deliveryFailures24h: 0,
        },
        outbox: [
          {
            id: "outbox1",
            category: "LOGIN",
            createdAt: time,
            attempts: 1,
            status: "PENDING",
            code: null,
          },
        ],
        attempts: [],
        events: [],
      }}
      onRefresh={noop}
    />,
    ["LOGIN", "В очереди"],
  ],
  [
    "gafus",
    <GafusPanel
      source={{
        settings: {
          revision: 1,
          economyEnabled: true,
          earningEnabled: true,
          spendingEnabled: true,
          postReward: 1,
          questionReward: 1,
          answerReward: 1,
          activityLimit: 3,
          activityWindowSeconds: 86400,
          reactionThreshold: 10,
          reactionReward: 1,
          bestAnswerReward: 1,
          courseStepCost: 1,
          miniGuideCost: 1,
          accessDurationSeconds: 604800,
        },
        wallets: { count: 1, outstanding: 20 },
        transactions: [{ kind: "EARN", _sum: { delta: 20 } }],
        fraudOpen: 1,
      }}
      tab="dashboard"
      onSaved={noop}
    />,
    ["Кошельков", "20"],
  ],
] as const;

describe("Vite Admin nonempty realistic Hono payloads", () => {
  it.each(rows)("%s renders actual row content and actions", (_id, component, phrases) => {
    const html = renderToStaticMarkup(component);
    for (const phrase of phrases) expect(html).toContain(phrase);
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("undefined");
    if (_id === "bookings") {
      // Source instant is 12:00 UTC. Browser timezone must not change the displayed slot.
      expect(html).toContain("15:00 - 15:30 (МСК)");
    }
    if (_id === "consultations") expect(html).toContain("В каталоге");
  });
});
