/** Keep the legacy Next trainerId deep link while rejecting arbitrary URL fragments. */
export const SCHEDULE_ROUTE = "/main-panel/consultations/trainers-schedules";
const TRAINER_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function validScheduleTrainerId(id: string): boolean {
  return TRAINER_ID.test(id);
}

export function trainerIdFromScheduleSearch(pathname: string, search: string): string {
  if (pathname !== SCHEDULE_ROUTE) return "";
  const id = new URLSearchParams(search).get("trainerId") ?? "";
  return validScheduleTrainerId(id) ? id : "";
}

export function scheduleTrainerUrl(id: string): string {
  if (!id) return SCHEDULE_ROUTE;
  if (!validScheduleTrainerId(id)) throw Error("Некорректный ID кинолога");
  return `${SCHEDULE_ROUTE}?trainerId=${encodeURIComponent(id)}`;
}
