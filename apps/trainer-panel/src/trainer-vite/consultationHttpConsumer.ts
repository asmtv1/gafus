import { buildTrainerStaffRequest, parseStaffHttp, type PanelActor, type StaffDescriptor } from "./consultationContract";

/** Source-only transport adapter. Auth headers are provided by a verified caller; never cache or retry mutations. */
export async function callTrainerConsultationMethod(input: {
  descriptor: StaffDescriptor;
  actor: PanelActor;
  targetTrainerId?: string;
  resourceId?: string;
  body?: unknown;
  accessToken: string;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<unknown> {
  if (!input.accessToken) throw new Error("MISSING_AUTH");
  const req = buildTrainerStaffRequest(input.descriptor, input.actor, {
    targetTrainerId: input.targetTrainerId, resourceId: input.resourceId, body: input.body,
  });
  const response = await input.fetchImpl(req.path, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      ...(req.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(req.body === undefined ? {} : { body: JSON.stringify(req.body) }),
    cache: "no-store",
    signal: input.signal,
  });
  const raw = await response.text();
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { throw new Error("UNCONFIRMED_RESPONSE"); }
  return parseStaffHttp(input.descriptor, response.status, decoded, response.headers.get("cache-control"));
}
