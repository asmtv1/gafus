type AppSubscriptionStatusLabelRow = {
  status: string;
  isActiveNow: boolean;
  isLifetime: boolean;
  activeUntil: string | null;
};

const statusLabels: Record<string, string> = {
  PENDING: "Ожидает",
  ACTIVE: "Активна",
  PAST_DUE: "Проблема оплаты",
  CANCELED: "Отменена",
  EXPIRED: "Истекла",
  REFUNDED: "Возврат",
  REVOKED: "Отозвана",
};

function getEffectiveAppSubscriptionStatus(row: AppSubscriptionStatusLabelRow): string {
  if (row.status === "ACTIVE" && !row.isActiveNow && !row.isLifetime) {
    return "EXPIRED";
  }
  return row.status;
}

export function getAppSubscriptionStatusLabel(row: AppSubscriptionStatusLabelRow): string {
  const effectiveStatus = getEffectiveAppSubscriptionStatus(row);
  return statusLabels[effectiveStatus] ?? effectiveStatus;
}
