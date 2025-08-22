// Экспорт всех stores для удобного импорта
export * from "./courseStore";
export * from "./offlineStore";
export * from "./petsStore";
export * from "./stepStore";
export * from "./timerStore";
export * from "./trainingStore";
export * from "./userStore";

// Новые модульные notification stores
export * from "./notification/notificationComposite";
export * from "./permission/permissionStore";
export * from "./push/pushStore";
export * from "./ui/notificationUIStore";

// Обратная совместимость - экспортируем главный композитный store как notificationStore
export { useNotificationComposite as useNotificationStore } from "./notification/notificationComposite";
