import { Alert, Linking } from "react-native";

/**
 * Показывает alert о заблокированном дне "Подведение итогов" (как на web)
 */
export function showLockedDayAlert(): void {
  Alert.alert(
    "День заблокирован 🔒",
    "Чтобы открыть этот день, необходимо завершить все остальные дни курса. Продолжайте тренировки, и этот день станет доступен автоматически!",
    [{ text: "Понятно", style: "default" }],
    { cancelable: true },
  );
}

/**
 * Показывает alert о недоступности приватного курса
 * После закрытия выполняет callback для редиректа
 */
export function showPrivateCourseAccessDeniedAlert(onConfirm?: () => void): void {
  Alert.alert(
    "Курс недоступен 🔒",
    "Этот курс приватный и доступен только по приглашению. Обратитесь к кинологу для получения доступа.",
    [
      {
        text: "Понятно",
        onPress: onConfirm,
        style: "default",
      },
    ],
    { cancelable: false },
  );
}

export const WEB_BASE = "https://gafus.ru";

export function showPaidCourseAccessDeniedAlert(
  courseType?: string,
  onCancel?: () => void,
): void {
  const url = courseType ? `${WEB_BASE}/trainings/${courseType}` : `${WEB_BASE}/courses`;
  Alert.alert(
    "Нет доступа к курсу",
    "Этот курс платный. Оплатите его на сайте, после чего доступ откроется в приложении.",
    [
      { text: "Отмена", onPress: onCancel, style: "cancel" },
      { text: "Оплатить на сайте", onPress: () => Linking.openURL(url), style: "default" },
    ],
    { cancelable: true },
  );
}

export function showPaidCoursePaymentOptions(params: {
  courseType?: string;
  onPayInApp: () => void;
  onCancel?: () => void;
}): void {
  const { courseType, onPayInApp, onCancel } = params;
  const url = courseType ? `${WEB_BASE}/trainings/${courseType}` : `${WEB_BASE}/courses`;
  Alert.alert(
    "Нет доступа к курсу",
    "Этот курс платный. Вы можете оплатить в приложении или перейти на сайт.",
    [
      { text: "Отмена", onPress: onCancel, style: "cancel" },
      { text: "Оплатить на сайте", onPress: () => Linking.openURL(url), style: "default" },
      { text: "Оплатить", onPress: onPayInApp, style: "default" },
    ],
    { cancelable: true },
  );
}
