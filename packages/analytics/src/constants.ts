/** Максимальный размер JSON props (UTF-8 байты) перед заменой на `{ truncated: true }` (F6). */
export const MAX_ANALYTICS_PROPS_BYTES = 4096;

/** Очередь событий до init / opt-in; при переполнении — отбрасываем старые (F4). */
export const ANALYTICS_QUEUE_MAX = 50;
