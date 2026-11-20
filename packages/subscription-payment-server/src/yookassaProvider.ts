/** YooKassa provider adapter: transport, credentials and verified provider ownership.
 * No DB operations: subscription state transitions remain the payment service's job. */
import { amountsEqual } from "./paymentPure";
const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";
const YOOKASSA_REFUNDS_API = "https://api.yookassa.ru/v3/refunds";
const YOOKASSA_PAYMENT_METHODS_API = "https://api.yookassa.ru/v3/payment_methods";

export class YookassaHttpError extends Error {
    constructor(
      message: string,
      public readonly status: number,
    ) {
      super(message);
      this.name = "YookassaHttpError";
    }
  }

export type YooKassaPaymentObject = {
    id?: string;
    status?: string;
    paid?: boolean;
    amount?: { value?: string; currency?: string };
    metadata?: Record<string, string | undefined>;
    income_amount?: { value?: string; currency?: string };
    captured_at?: string;
    payment_method?: {
      id?: string;
      type?: string;
      title?: string;
      card?: { last4?: string };
    };
  };

export type YooKassaRefundObject = {
    created_at?: string;
    id?: string;
    status?: string;
    payment_id?: string;
    amount?: { value?: string; currency?: string };
  };

export type YooKassaBankCardDetails = {
    first6?: string;
    last4?: string;
    expiry_month?: string;
    expiry_year?: string;
    card_type?: string;
    issuer_country?: string;
    issuer_name?: string;
  };

export type YooKassaPaymentMethodObject = {
    id?: string;
    status?: string;
    saved?: boolean;
    type?: string;
    title?: string;
    card?: YooKassaBankCardDetails;
    metadata?: Record<string, string | undefined>;
    confirmation?: { confirmation_url?: string };
  };

export function getYookassaCredentials(params?: { shopId?: string; secretKey?: string }) {
    const shopId = params?.shopId ?? process.env.YOOKASSA_SHOP_ID;
    const secretKey = params?.secretKey ?? process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      throw new Error("YooKassa credentials are missing");
    }
    return { shopId, secretKey };
  }

/** Starts an SBP payment-method registration. HTTP and provider-envelope validation
 * live here; this adapter must never modify local subscription or ledger state. */
export type YookassaPaymentMethodRequestResult =
  | { ok: true; paymentMethodId: string; confirmationUrl: string }
  | { ok: false; kind: "transport"; cause: unknown }
  | { ok: false; kind: "rejected"; status: number; responseText: string }
  | { ok: false; kind: "invalid"; responseData: unknown };

export async function requestYookassaPaymentMethod(params: {
  shopId: string;
  secretKey: string;
  idempotenceKey: string;
  body: unknown;
}): Promise<YookassaPaymentMethodRequestResult> {
  const auth = Buffer.from(`${params.shopId}:${params.secretKey}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(YOOKASSA_PAYMENT_METHODS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": params.idempotenceKey,
      },
      body: JSON.stringify(params.body),
    });
  } catch (cause) {
    return { ok: false, kind: "transport", cause };
  }
  if (!response.ok) {
    return { ok: false, kind: "rejected", status: response.status,
      responseText: await response.text() };
  }
  // Invalid JSON rejects, just as it did before extraction. No entitlement is
  // granted until the payment method has been persisted by the caller.
  const data = await response.json() as {
    id?: string;
    confirmation?: { confirmation_url?: string };
  };
  if (!data?.id || !data?.confirmation?.confirmation_url) {
    return { ok: false, kind: "invalid", responseData: data };
  }
  return { ok: true, paymentMethodId: data.id,
    confirmationUrl: data.confirmation.confirmation_url };
}

export async function fetchYookassaPaymentObject(params: {
    yookassaPaymentId: string;
    shopId?: string;
    secretKey?: string;
  }): Promise<YooKassaPaymentObject> {
    const { shopId, secretKey } = getYookassaCredentials(params);
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
    const response = await fetch(
      `${YOOKASSA_API}/${encodeURIComponent(params.yookassaPaymentId)}`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new YookassaHttpError(
        `YooKassa payment verification failed: ${response.status} ${text}`.slice(0, 512),
        response.status,
      );
    }
    return (await response.json()) as YooKassaPaymentObject;
  }

export async function fetchYookassaRefundObject(params: {
    yookassaRefundId: string;
    shopId?: string;
    secretKey?: string;
  }): Promise<YooKassaRefundObject> {
    const { shopId, secretKey } = getYookassaCredentials(params);
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
    const response = await fetch(
      `${YOOKASSA_REFUNDS_API}/${encodeURIComponent(params.yookassaRefundId)}`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new YookassaHttpError(
        `YooKassa refund verification failed: ${response.status} ${text}`.slice(0, 512),
        response.status,
      );
    }
    return (await response.json()) as YooKassaRefundObject;
  }

export async function fetchYookassaPaymentMethodObject(params: {
    paymentMethodId: string;
    shopId?: string;
    secretKey?: string;
  }): Promise<YooKassaPaymentMethodObject> {
    const { shopId, secretKey } = getYookassaCredentials(params);
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
    const response = await fetch(
      `${YOOKASSA_PAYMENT_METHODS_API}/${encodeURIComponent(params.paymentMethodId)}`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new YookassaHttpError(
        `YooKassa payment method verification failed: ${response.status} ${text}`.slice(0, 512),
        response.status,
      );
    }
    return (await response.json()) as YooKassaPaymentMethodObject;
  }

export function assertYookassaPaymentBelongsToLocalPayment(params: {
    providerPayment: YooKassaPaymentObject;
    localPayment: {
      id: string;
      userId: string;
      planCode?: string | null;
      amount?: unknown;
      currency?: string | null;
    };
    yookassaPaymentId: string;
  }) {
    const providerPayment = params.providerPayment;
    if (providerPayment.id !== params.yookassaPaymentId) {
      throw new Error("YooKassa payment id mismatch");
    }
    if (providerPayment.metadata?.kind !== "app_subscription") {
      throw new Error("YooKassa payment metadata kind mismatch");
    }
    if (providerPayment.metadata?.localPaymentId !== params.localPayment.id) {
      throw new Error("YooKassa payment metadata localPaymentId mismatch");
    }
    if (providerPayment.metadata?.userId !== params.localPayment.userId) {
      throw new Error("YooKassa payment metadata userId mismatch");
    }
    if (
      providerPayment.metadata?.planCode &&
      params.localPayment.planCode &&
      providerPayment.metadata.planCode !== params.localPayment.planCode
    ) {
      throw new Error("YooKassa payment metadata planCode mismatch");
    }

    if (!amountsEqual(providerPayment.amount?.value, params.localPayment.amount)) {
      throw new Error("YooKassa payment amount mismatch");
    }
    if ((providerPayment.amount?.currency ?? null) !== (params.localPayment.currency ?? null)) {
      throw new Error("YooKassa payment currency mismatch");
    }
  }

  type YookassaPaymentAssertionParams = Parameters<
    typeof assertYookassaPaymentBelongsToLocalPayment
  >[0];

export function assertYookassaPaymentConfirmed(params: YookassaPaymentAssertionParams) {
    assertYookassaPaymentBelongsToLocalPayment(params);
    if (params.providerPayment.status !== "succeeded" || params.providerPayment.paid !== true) {
      throw new Error("YooKassa payment is not confirmed");
    }
  }

export function assertYookassaPaymentCanceled(params: YookassaPaymentAssertionParams) {
    assertYookassaPaymentBelongsToLocalPayment(params);
    if (params.providerPayment.status !== "canceled") {
      throw new Error("YooKassa payment is not canceled");
    }
  }

export function assertYookassaPaymentMethodActive(params: {
    providerPaymentMethod: YooKassaPaymentMethodObject;
    paymentMethodId: string;
    subscriptionId: string;
    userId: string;
  }) {
    const method = params.providerPaymentMethod;
    if (method.id !== params.paymentMethodId) {
      throw new Error("YooKassa payment method id mismatch");
    }
    if (!method.metadata) {
      throw new Error("YooKassa payment method metadata is missing");
    }
    if (method.metadata.kind !== "app_subscription_payment_method") {
      throw new Error("YooKassa payment method metadata kind mismatch");
    }
    if (method.metadata.subscriptionId !== params.subscriptionId) {
      throw new Error("YooKassa payment method metadata subscriptionId mismatch");
    }
    if (method.metadata.userId !== params.userId) {
      throw new Error("YooKassa payment method metadata userId mismatch");
    }
    if (method.status !== "active" || method.saved !== true) {
      throw new Error("YooKassa payment method is not active and saved");
    }
  }

export function getYookassaPaymentMethodInactiveReason(params: {
    providerPaymentMethod: YooKassaPaymentMethodObject;
    paymentMethodId: string;
    subscriptionId: string;
    userId: string;
  }): string | null {
    const method = params.providerPaymentMethod;
    if (method.id !== params.paymentMethodId) {
      return "YooKassa payment method id mismatch";
    }
    if (!method.metadata) {
      return "YooKassa payment method metadata is missing";
    }
    if (method.metadata.kind !== "app_subscription_payment_method") {
      return "YooKassa payment method metadata kind mismatch";
    }
    if (method.metadata.subscriptionId !== params.subscriptionId) {
      return "YooKassa payment method metadata subscriptionId mismatch";
    }
    if (method.metadata.userId !== params.userId) {
      return "YooKassa payment method metadata userId mismatch";
    }
    if (method.status !== "active" || method.saved !== true) {
      return "YooKassa payment method is not active and saved";
    }
    return null;
  }
