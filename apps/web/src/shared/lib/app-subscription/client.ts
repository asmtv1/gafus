export async function fetchAppSubscriptionStatus() {
  const response = await fetch("/api/v1/app-subscription/status", { cache: "no-store" });
  return response.json();
}

export async function fetchAppSubscriptionOffer() {
  const response = await fetch("/api/v1/app-subscription/offer", { cache: "no-store" });
  return response.json();
}

export type AppSubscriptionPromoCodePreview = {
  code: string;
  revision: number;
  planCode: "MONTHLY" | "THREE_MONTHS";
  discountPercent: number;
  originalPriceRub: number;
  discountedPriceRub: number;
  renewalPriceRub: number;
  intervalDays: number;
  currency: "RUB";
};

export type AppSubscriptionYookassaStartResult = {
  confirmationUrl: string;
  localSubscriptionId: string;
};

export class AppSubscriptionApiError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AppSubscriptionApiError";
  }
}

async function postAppSubscription<T>(
  path: string,
  csrfToken: string,
  body: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AppSubscriptionApiError("Не удалось связаться с сервером", null, 0);
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AppSubscriptionApiError(
      typeof json?.error === "string" ? json.error : "Не удалось выполнить запрос",
      typeof json?.code === "string" ? json.code : null,
      response.status,
    );
  }
  if (!json?.data) {
    throw new AppSubscriptionApiError("Сервер вернул неполный ответ", null, response.status);
  }
  return json.data as T;
}

export function previewAppSubscriptionPromoCode(params: {
  planCode: "MONTHLY" | "THREE_MONTHS";
  promoCode: string;
  csrfToken: string;
}): Promise<AppSubscriptionPromoCodePreview> {
  return postAppSubscription<AppSubscriptionPromoCodePreview>(
    "/api/v1/app-subscription/promo-code/preview",
    params.csrfToken,
    { planCode: params.planCode, promoCode: params.promoCode },
  );
}

export function startAppSubscriptionYookassaPayment(params: {
  planCode: "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS";
  csrfToken: string;
  promoCode?: Pick<AppSubscriptionPromoCodePreview, "code" | "revision">;
}): Promise<AppSubscriptionYookassaStartResult> {
  return postAppSubscription<AppSubscriptionYookassaStartResult>(
    "/api/v1/app-subscription/yookassa/start",
    params.csrfToken,
    {
      planCode: params.planCode,
      ...(params.promoCode ? { promoCode: params.promoCode } : {}),
    },
  );
}
