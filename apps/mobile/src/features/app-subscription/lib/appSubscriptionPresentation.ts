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

export function getYookassaPrimaryCta(params: { offer: TrialPresentationSource }): string {
  if (!isTrialAvailable(params.offer)) {
    return "Оформить подписку";
  }
  return `Попробовать ${getTrialDays(params.offer)} дня бесплатно`;
}

export function getYookassaPricePillText(params: {
  offer: TrialPresentationSource;
}): string | null {
  if (!isTrialAvailable(params.offer)) {
    return null;
  }
  return `${getTrialDays(params.offer)} дня бесплатно`;
}

export function getYookassaPaymentCaption(params: { offer: TrialPresentationSource }): string {
  if (!isTrialAvailable(params.offer)) {
    return "Списание произойдёт при оформлении подписки. Карту можно отвязать в профиле.";
  }
  return `Карта привязывается сейчас без списания. Первое списание — через ${getTrialDays(params.offer)} дня.`;
}

export function getYookassaLegalSuffix(params: { offer: TrialPresentationSource }): string {
  if (!isTrialAvailable(params.offer)) {
    return "; при оплате картой РФ способ оплаты сохраняется в ЮKassa.";
  }
  return `; при оплате картой РФ способ оплаты сохраняется в ЮKassa, первые ${getTrialDays(params.offer)} дня бесплатны.`;
}

export function getYookassaTrialUnavailableText(params: {
  offer: TrialPresentationSource;
}): string | null {
  if (params.offer?.yookassaTrialUnavailableReason === "CARD_FINGERPRINT_REUSED") {
    return "На эту карту пробный период уже использован. Premium можно подключить через обычную оплату.";
  }
  return null;
}
