/** Training reminder application: validates input then delegates the atomic
 * owner-fenced database operations to notifications-server.
 */
import {
 readTrainingReminderRows,createTrainingReminderRow,
 updateTrainingReminderRow,deleteTrainingReminderRow,
 type TrainingReminderUpdate,
} from "./training-reminder-storage.js";

/** ЧЧ:ММ, 00:00 – 23:59 */
const REMINDER_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** Строка из цифр 1-7 через запятую, без пробелов; каждая цифра уникальна не гарантируется, но парсер это переживёт */
const REMINDER_DAYS_RE = /^[1-7](,[1-7])*$/;

function validateTime(time: string): void {
  if (!REMINDER_TIME_RE.test(time)) {
    throw new Error("Некорректный формат времени (ожидается ЧЧ:ММ, например 09:00)");
  }
}

function validateDays(days: string | null | undefined): void {
  if (!days) return; // null / undefined → каждый день, валидно
  if (!REMINDER_DAYS_RE.test(days)) {
    throw new Error("Некорректный формат дней недели (ожидается строка вида '1,3,5')");
  }
}

function validateTimezone(tz: string | null | undefined): void {
  if (!tz) return;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    throw new Error(`Некорректная timezone: ${tz}`);
  }
}

export const getReminders=readTrainingReminderRows;

export async function createReminder(userId:string,name:string,reminderTime:string,
 reminderDays?:string|null,timezone?:string|null){
 validateTime(reminderTime);
 validateDays(reminderDays);
 validateTimezone(timezone);
 return createTrainingReminderRow(userId,name,reminderTime,reminderDays,timezone);
}
export async function updateReminder(userId:string,id:string,data:TrainingReminderUpdate){
 if(data.reminderTime!==undefined)validateTime(data.reminderTime);
 if(data.reminderDays!==undefined)validateDays(data.reminderDays);
 if(data.timezone!==undefined)validateTimezone(data.timezone);
 return updateTrainingReminderRow(userId,id,data);
}
export async function deleteReminder(userId:string,id:string){
 return deleteTrainingReminderRow(userId,id);
}
