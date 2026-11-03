import type { PanelActor } from "./consultationContract";
import type { TrainerBookingRecord } from "./TrainerBookingTransitionAction";

/** Do not allow local timezone inference or JavaScript calendar normalization in server DTOs. */
const bookingInstant=(value:unknown):number|null=>{
  if(typeof value!=="string")return null;
  const pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;
  const suffix = /(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
  if(!pattern.test(value)||!suffix.test(value))return null;
  const match = new RegExp(pattern.source + suffix.source).exec(value);
  if(!match)return null;
  const [,year,month,day,hour,minute,second]=match;
  if(Number(hour)>23||Number(minute)>59||Number(second)>59)return null;
  const calendar=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));
  if(!Number.isFinite(calendar.valueOf())||
     calendar.toISOString().slice(0,10)!==`${year}-${month}-${day}`)return null;
  const instant=Date.parse(value);
  return Number.isFinite(instant)?instant:null;
};

/** A trusted 200 is not proof of unique owner-bound records or a usable slot interval. */
export function verifiedBookings(data: unknown, actor: PanelActor): data is TrainerBookingRecord[] {
  if (!Array.isArray(data) || data.length > 200) return false;
  const ids = new Set<string>();
  for (const row of data) {
    if (!row || typeof row !== "object" ||
        typeof row.id !== "string" || !row.id.trim() || ids.has(row.id) ||
        typeof row.status !== "string" || !row.status.trim() ||
        typeof row.cynologistUserId !== "string" || !row.cynologistUserId.trim() ||
        (actor.role === "TRAINER" && row.cynologistUserId !== actor.id) ||
        !row.slot || typeof row.slot.id !== "string" || !row.slot.id.trim() ||
        typeof row.slot.startAtUtc !== "string" ||
        typeof row.slot.endAtUtc !== "string") return false;
    const optionalFields=["cancelReason", "clientUsername", "clientOwnerName", "clientPhone",
      "petName", "petGender", "petAge", "petBreed", "clientProblem",
      "clientSelfHelpAttempt", "confirmationDeadlineAt"] as const;
    if(optionalFields.some(key=>{
      const value=row[key];
      return value!==undefined && value!==null &&
        (typeof value!=="string" || value.length>10000);
    })) return false;
    if(row.confirmationDeadlineAt && bookingInstant(row.confirmationDeadlineAt)===null) return false;
    const start=bookingInstant(row.slot.startAtUtc);
    const end=bookingInstant(row.slot.endAtUtc);
    if(start===null||end===null||end<=start)return false;
    ids.add(row.id);
  }
  return true;
}
