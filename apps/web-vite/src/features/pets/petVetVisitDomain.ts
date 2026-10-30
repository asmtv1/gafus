import { vetVisitToday } from "@gafus/types";

/** Exact server-compatible form bounds shared by editor and details view. */
export const fields = [
  ["specialty", "Специальность врача", 200],
  ["doctorName", "ФИО врача", 200],
  ["clinic", "Какая клиника", 300],
  ["diagnosis", "Какой был диагноз", 10000],
  ["conclusion", "Какое было заключение", 10000],
  ["notes", "Ваши заметки", 10000],
] as const;
/** Local calendar date, not an arbitrary Date.parse normalization. */
export const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  value >= "1900-01-01" &&
  value <= vetVisitToday() &&
  !Number.isNaN(Date.parse(value + "T12:00:00Z")) &&
  new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
