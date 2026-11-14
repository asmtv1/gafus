import {
  withProfitReadSnapshot,
  type ProfitReadRows,
} from "./profit-dashboard-rows.js";
import {
  withProfitVideoExpenseTx,
  type ProfitWriteRows,
} from "./profit-video-rows.js";
import {
  calculateProfit,
  dayStart,
  moneyKopecks,
  npdKopecks,
  PROFIT_START,
  PROFIT_START_DAY,
  profitPeriod,
  samaraDay,
  serverExpenseKopecks,
  VIDEO_PRICE_KOPECKS,
  type ProfitTotals,
} from "@gafus/subscription-shared/profitMath";

export { PROFIT_START_DAY } from "@gafus/subscription-shared/profitMath";

export type ProfitPaymentRow = {
  id: string;
  date: string | null;
  amountKopecks: number | null;
  method: string | null;
  feeKopecks: number | null;
  npdKopecks: number | null;
  complete: boolean;
};
export type ProfitVideoRow = {
  id: string;
  partnerId: string;
  partnerName: string;
  paidDay: string;
  quantity: number;
  amountKopecks: number;
  comment: string | null;
  canceled: boolean;
  version: number;
};
export type ProfitDashboard = {
  from: string;
  to: string;
  today: string;
  totals: ProfitTotals;
  profitKopecks: number | null;
  incompletePayments: number;
  missingFees: number;
  undatedPayments: number;
  payments: ProfitPaymentRow[];
  paymentCount: number;
  paymentPage: number;
  videos: ProfitVideoRow[];
  videoCount: number;
  videoPage: number;
  pageSize: number;
  partners: { id: string; name: string; active: boolean }[];
};

const partnerName = (user: { username: string; profile: { fullName: string | null } | null }) =>
  user.profile?.fullName || user.username;

export async function getProfitDashboard(
  params: { from?: string; to?: string; paymentPage?: number; videoPage?: number },
  now = new Date(),
): Promise<ProfitDashboard> {
  const period = profitPeriod(params.from, params.to, now);
  return withProfitReadSnapshot(
    { start: period.start, end: period.end, profitStart: PROFIT_START },
    (rows) => readProfitDashboard(rows, params, now),
  );
}

async function readProfitDashboard(
  db: ProfitReadRows,
  params: {
    from?: string;
    to?: string;
    paymentPage?: number;
    videoPage?: number;
  },
  now = new Date(),
): Promise<ProfitDashboard> {
  const period = profitPeriod(params.from, params.to, now);

  const totals: ProfitTotals = {
    payments: 0,
    refunds: 0,
    yookassa: 0,
    npd: 0,
    partners: 0,
    videos: 0,
    server: serverExpenseKopecks(period.start, period.end, now),
  };
  let incompletePayments = 0;
  let missingFees = 0;
  let undatedPayments = 0;
  let cursor: string | undefined;
  // Bounded batches: no unbounded payment/ledger graph is loaded into memory.
  while (true) {
    const batch = await db.readPaymentBatch(cursor);
    if (!batch.length) break;
    const refundGroups = await db.readRefundSums(batch.map((p) => p.id));
    const refundTotals = new Map(refundGroups.map((r) => [r.paymentId, r._sum.amountKopecks ?? 0]));
    for (const payment of batch) {
      const paid = payment.providerCapturedAt ?? payment.succeededAt;
      const inPeriod = paid && paid >= period.start && paid < period.end && paid <= now;
      const touchesPeriod =
        inPeriod || payment.financeRefunds.length > 0 || payment.partnerCommissions.length > 0;
      if (!paid) {
        undatedPayments += 1;
        continue;
      }
      if (paid > now) continue;
      let amount: number | null = null;
      let fee: number | null = null;
      try {
        if (payment.currency !== "RUB") throw new Error("Unsupported currency");
        amount = moneyKopecks(payment.amount);
        if (payment.providerIncomeAmount !== null) {
          fee = amount - moneyKopecks(payment.providerIncomeAmount);
          if (fee < 0) fee = null;
        }
      } catch {
        /* The incomplete result is explicit, never assumed zero. */
      }
      if (
        (touchesPeriod &&
          (amount === null ||
            fee === null ||
            !payment.providerCapturedAt ||
            payment.financeRefundsIncomplete ||
            (payment.status === "REFUNDED" && (refundTotals.get(payment.id) ?? 0) !== amount))) ||
        (paid < period.end &&
          (payment.financeRefundsIncomplete ||
            (payment.status === "REFUNDED" && (refundTotals.get(payment.id) ?? 0) !== amount)))
      ) {
        incompletePayments += 1;
      }
      if (inPeriod) {
        if (amount !== null) {
          totals.payments += amount;
          totals.npd += npdKopecks(amount);
        }
        if (fee !== null) totals.yookassa += fee;
        else missingFees += 1;
      }
      for (const refund of payment.financeRefunds) {
        totals.refunds += refund.amountKopecks;
        totals.npd -= npdKopecks(refund.amountKopecks);
      }
      for (const commission of payment.partnerCommissions)
        totals.partners += commission.amountKopecks;
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < 500) break;
  }

  const pageSize = 25;
  const [paymentCount, videoCount, videoSum, partners] = await Promise.all([
    db.readPaymentCount(),
    db.readVideoCount(),
    db.readVideoSum(),
    db.readPartnerRows(),
  ]);
  totals.videos = videoSum._sum.amountKopecks ?? 0;
  const clampPage = (page: number | undefined, count: number) =>
    Math.min(
      Math.max(1, Number.isSafeInteger(page) ? page! : 1),
      Math.max(1, Math.ceil(count / pageSize)),
    );
  const paymentPage = clampPage(params.paymentPage, paymentCount);
  const videoPage = clampPage(params.videoPage, videoCount);
  const [paymentRows, videoRows] = await Promise.all([
    db.readPaymentPage(paymentPage, pageSize),
    db.readVideoPage(videoPage, pageSize),
  ]);
  return {
    from: period.from,
    to: period.to,
    today: samaraDay(now),
    totals,
    profitKopecks: incompletePayments || undatedPayments ? null : calculateProfit(totals),
    incompletePayments,
    missingFees,
    undatedPayments,
    pageSize,
    paymentCount,
    videoCount,
    paymentPage,
    videoPage,
    partners: partners.map((p) => ({ id: p.id, name: partnerName(p.user), active: p.isActive })),
    videos: videoRows.map((v) => ({
      id: v.id,
      partnerId: v.partnerId,
      partnerName: partnerName(v.partner.user),
      paidDay: samaraDay(v.paidAt),
      quantity: v.quantity,
      amountKopecks: v.amountKopecks,
      comment: v.comment,
      canceled: v.canceledAt !== null,
      version: v.version,
    })),
    payments: paymentRows.map((p) => {
      let amount: number | null = null;
      let fee: number | null = null;
      try {
        if (p.currency === "RUB") {
          amount = moneyKopecks(p.amount);
          if (p.providerIncomeAmount !== null) fee = amount - moneyKopecks(p.providerIncomeAmount);
          if (fee !== null && fee < 0) fee = null;
        }
      } catch {
        /* Display unknown values explicitly. */
      }
      return {
        id: p.id,
        date: (p.providerCapturedAt ?? p.succeededAt)?.toISOString() ?? null,
        amountKopecks: amount,
        feeKopecks: fee,
        method: p.providerPaymentMethodType,
        npdKopecks: amount === null ? null : npdKopecks(amount),
        complete:
          fee !== null &&
          !!p.providerCapturedAt &&
          !p.financeRefundsIncomplete &&
          (p.status !== "REFUNDED" ||
            p.financeRefunds.reduce((sum, r) => sum + r.amountKopecks, 0) === amount),
      };
    }),
  };
}

export type VideoExpenseInput = {
  partnerId: string;
  paidDay: string;
  quantity: number;
  comment?: string;
};

function videoData(input: VideoExpenseInput, now = new Date()) {
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 10_000 ||
    !input.partnerId ||
    (input.comment?.length ?? 0) > 512
  )
    throw new Error("Некорректные данные видео");
  if (input.paidDay < PROFIT_START_DAY || input.paidDay > samaraDay(now))
    throw new Error("Некорректная дата выплаты");
  return {
    partnerId: input.partnerId,
    paidAt: dayStart(input.paidDay),
    quantity: input.quantity,
    unitPriceKopecks: VIDEO_PRICE_KOPECKS,
    amountKopecks: input.quantity * VIDEO_PRICE_KOPECKS,
    comment: input.comment?.trim() || null,
  };
}

async function requireActor(tx: ProfitWriteRows, actorId: string) {
  const actor = await tx.actorRole(actorId);
  if (actor?.role !== "ADMIN") throw new Error("Недостаточно прав");
}

export async function saveProfitVideoExpense(params: {
  actorId: string;
  requestKey: string;
  input: VideoExpenseInput;
  id?: string;
  version?: number;
}) {
  const data = videoData(params.input);
  if (!/^[\w-]{16,64}$/.test(params.requestKey)) throw new Error("Некорректный ключ операции");
  return withProfitVideoExpenseTx(async (tx) => {
    await requireActor(tx, params.actorId);
    if (!(await tx.partnerExists(data.partnerId))) throw new Error("Креатор не найден");
    if (!params.id) {
      const created = await tx.createExpenseOnce(data, params.actorId, params.requestKey);
      const row = await tx.findExpenseByRequestKey(params.requestKey);
      if (
        row.actorId !== params.actorId ||
        row.partnerId !== data.partnerId ||
        row.quantity !== data.quantity ||
        row.paidAt.getTime() !== data.paidAt.getTime() ||
        row.comment !== data.comment
      ) {
        throw new Error("Ключ операции уже использован для другой записи");
      }
      if (created.count)
        await tx.appendRevision({
          expenseId: row.id,
          actorId: params.actorId,
          action: "CREATE",
          snapshot: { ...data, paidAt: data.paidAt.toISOString() },
        });
      return row.id;
    }
    const old = await tx.findExpenseById(params.id!);
    const updated = await tx.updateExpenseCAS(params.id!, params.version ?? 0, data);
    if (!updated.count) throw new Error("Запись уже изменена или отменена. Обновите страницу");
    await tx.appendRevision({
      expenseId: old.id,
      actorId: params.actorId,
      action: "UPDATE",
      snapshot: {
        before: {
          ...old,
          paidAt: old.paidAt.toISOString(),
          createdAt: old.createdAt.toISOString(),
          updatedAt: old.updatedAt.toISOString(),
          canceledAt: null,
        },
        after: { ...data, paidAt: data.paidAt.toISOString() },
      },
    });
    return old.id;
  });
}

export async function cancelProfitVideoExpense(actorId: string, id: string, version: number) {
  return withProfitVideoExpenseTx(async (tx) => {
    await requireActor(tx, actorId);
    const old = await tx.findExpenseById(id);
    if (old.canceledAt) return;
    const changed = await tx.cancelExpenseCAS(id, version);
    if (!changed.count) throw new Error("Запись уже изменена. Обновите страницу");
    await tx.appendRevision({
      expenseId: id,
      actorId,
      action: "CANCEL",
      snapshot: {
        ...old,
        paidAt: old.paidAt.toISOString(),
        createdAt: old.createdAt.toISOString(),
        updatedAt: old.updatedAt.toISOString(),
        canceledAt: null,
      },
    });
  });
}
