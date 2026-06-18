type TrialPresentationSource =
  | {
      yookassaTrialAvailable?: boolean | null;
      yookassaTrialDays?: number | null;
      yookassaTrialUnavailableReason?: string | null;
    }
  | null
  | undefined;

function getTrialDays(source: TrialPresentationSource): number {
  return source?.yookassaTrialDays && source.yookassaTrialDays > 0 ? source.yookassaTrialDays : 3;
}

function isTrialAvailable(source: TrialPresentationSource): boolean {
  return source?.yookassaTrialAvailable === true;
}

export function getYookassaPrimaryCta(source: TrialPresentationSource): string {
  if (!isTrialAvailable(source)) {
    return "Оформить подписку";
  }
  return `Попробовать ${getTrialDays(source)} дня бесплатно`;
}

export function getYookassaPriceNote(source: TrialPresentationSource): string {
  if (!isTrialAvailable(source)) {
    return "Автопродление по тарифу";
  }
  return `${getTrialDays(source)} дня бесплатно, затем автопродление`;
}

export function getYookassaLegalText(source: TrialPresentationSource, priceText: string): string {
  if (!isTrialAvailable(source)) {
    return `списание произойдёт при оформлении подписки, затем подписка продлевается автоматически по тарифу ${priceText}. Автопродление можно отключить в профиле.`;
  }
  return `карта привязывается сейчас без списания, первые ${getTrialDays(source)} дня бесплатны, затем подписка продлевается автоматически по тарифу ${priceText}. Автопродление можно отключить в профиле до первого списания.`;
}

export function getYookassaReturnSuccessTitle(source: TrialPresentationSource): string {
  return isTrialAvailable(source) ? "Пробный период подключён" : "Premium подключён";
}

export function getYookassaTrialUnavailableText(source: TrialPresentationSource): string | null {
  if (source?.yookassaTrialUnavailableReason === "CARD_FINGERPRINT_REUSED") {
    return "На эту карту пробный период уже использован. Premium можно подключить через обычную оплату.";
  }
  return null;
}
