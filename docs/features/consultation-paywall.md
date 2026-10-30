# Пейвол записи к кинологу (Web Refactor)

При GET /api/v1/consultations/cynologists/:id/slots с HTTP 402
SpecialistDetail показывает встроенный SubscriptionCheckout
(context=consultation), а не баннер ошибки с кнопкой «Повторить».
Остальные ошибки (401/403/404/429) не превращаются в платёжный экран.

Показан только действующий серверный тариф THREE_MONTHS с
consultationBookingIncluded=true. Название, цена и период берутся из
проверенного /api/v1/app-subscription/offer. При отсутствии нужного тарифа
кнопка оплаты скрыта. Текущая подписка проверяется через
/api/v1/app-subscription/status. Активная несовместимая подписка не позволяет
создать второй платёж — вместо этого отображается пояснение.

Промокод проверяется в /api/v1/app-subscription/promo-code/preview.
Создание оплаты — только по явному нажатию кнопки. Запрос на
/api/v1/app-subscription/yookassa/start получает returnPath вида
/consultations/:trainerId; Hono и Core отвергают внешний URL и небезопасный
путь. return_url ЮKassa указывает на исходную страницу консультации с ?paid=1.
После подтверждения оплаты приложение обновляет кэш консультаций и
возвращает пользователя к выбору времени. Бронирование не выполняется
автоматически.

Общий пейвол и мобильные покупки сохраняют прежний маршрут возврата
/subscription?paid=1. Production не менялся.

Проверки: mounted tests SubscriptionCheckout и ConsultationsLivePage;
checkoutApi.test.ts, app-subscription.route.test.ts; Core paymentService.test.ts;
Chrome с синтетическими данными (1200, 390, 320 px).
