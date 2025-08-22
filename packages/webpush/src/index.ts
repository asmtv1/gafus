// Экспорт legacy webpush для обратной совместимости
import webpush from "web-push";

// Экспорт нового сервиса и типов
export * from "./db";
export * from "./service";
export * from "./types";

export default webpush;
