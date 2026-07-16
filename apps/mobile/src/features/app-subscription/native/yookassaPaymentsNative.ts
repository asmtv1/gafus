import { requireNativeModule } from "expo";

type TokenizeResult =
  | { status: "success"; paymentToken: string; paymentMethodType: "SBP" }
  | { status: "cancelled" };

type ConfirmationResult = { status: "completed" | "cancelled" };

type GafusYooKassaPaymentsNativeModule = {
  tokenize(
    amount: number,
    currency: string,
    title: string,
    subtitle: string,
    clientApplicationKey: string,
    shopId: string,
  ): Promise<TokenizeResult>;
  confirm(
    confirmationUrl: string,
    clientApplicationKey: string,
    shopId: string,
  ): Promise<ConfirmationResult>;
  close(): Promise<void>;
};

let moduleInstance: GafusYooKassaPaymentsNativeModule | null = null;

function getNativeModule(): GafusYooKassaPaymentsNativeModule {
  moduleInstance ??=
    requireNativeModule<GafusYooKassaPaymentsNativeModule>("GafusYooKassaPayments");
  return moduleInstance;
}

export const yookassaPaymentsNative = {
  tokenize(params: {
    amount: number;
    currency: string;
    title: string;
    subtitle: string;
    clientApplicationKey: string;
    shopId: string;
  }) {
    return getNativeModule().tokenize(
      params.amount,
      params.currency,
      params.title,
      params.subtitle,
      params.clientApplicationKey,
      params.shopId,
    );
  },
  confirm(params: { confirmationUrl: string; clientApplicationKey: string; shopId: string }) {
    return getNativeModule().confirm(
      params.confirmationUrl,
      params.clientApplicationKey,
      params.shopId,
    );
  },
  close() {
    return getNativeModule().close();
  },
};
