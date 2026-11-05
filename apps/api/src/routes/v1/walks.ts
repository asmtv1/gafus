import { Hono, type Context } from "hono";
import { z } from "zod/v3";
import { listCompletedDogWalks, syncCompletedDogWalks, syncDogWalkTrackPoints, listDogWalkTrackPoints, listDeletedDogWalkIds, deleteDogWalk } from "@gafus/core/services/walks";

export const walksRoutes = new Hono();
walksRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

const completed = z.object({
  clientId: z.string().uuid(),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  durationSeconds: z.number().int().min(0).max(604800),
  steps: z.number().int().min(0).max(2_000_000),
  estimatedMeters: z.number().int().min(0).max(1_000_000),
  timerMode: z.enum(["stopwatch", "countdown"]),
  incompleteSteps: z.boolean(),
  gpsEnabled: z.boolean().optional(),
  gpsMeters: z.number().int().min(0).max(1_000_000).nullable().optional(),
}).strict().superRefine((walk, ctx) => {
  const from = Date.parse(walk.startedAt);
  const to = Date.parse(walk.finishedAt);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from ||
      from < Date.UTC(2020,0,1) || to > Date.now() + 86400_000 ||
      walk.durationSeconds * 1000 > to - from + 1000) {
    ctx.addIssue({ code: "custom", message: "INVALID_WALK_TIME" });
  }
});
const syncSchema = z.object({ walks: z.array(completed).max(100) }).strict().superRefine((payload, ctx) => {
  const ids = payload.walks.map(walk => walk.clientId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", message: "DUPLICATE_CLIENT_ID" });
  }
});

function responseError(c: Context, error: unknown) {
  if (error instanceof Error && error.message === "WALK_NOT_FOUND") {
    return c.json({ success: false, code: "NOT_FOUND" }, 404);
  }
  if (error instanceof Error && error.message === "WALKS_FORBIDDEN") {
    return c.json({ success: false, code: "FORBIDDEN" }, 403);
  }
  return c.json({ success: false, code: "WALKS_UNAVAILABLE" }, 503);
}

walksRoutes.get("/", async c => {
  try {
    const data = await listCompletedDogWalks(c.get("user").id);
    return c.json({ success: true, data });
  } catch (error) {
    return responseError(c, error);
  }
});

walksRoutes.put("/sync", async c => {
  const length = Number(c.req.header("content-length") ?? "0");
  if (length > 100_000) return c.json({ success: false, code: "PAYLOAD_TOO_LARGE" }, 413);
  const raw = await c.req.text().catch(() => "");
  if (raw.length > 100_000) return c.json({ success: false, code: "PAYLOAD_TOO_LARGE" }, 413);
  let payload: z.infer<typeof syncSchema>;
  try {
    const valid = syncSchema.safeParse(JSON.parse(raw));
    if (!valid.success) return c.json({ success: false, code: "INVALID_WALKS" }, 400);
    payload = valid.data;
  } catch {
    return c.json({ success: false, code: "INVALID_WALKS" }, 400);
  }
  try {
    const data = await syncCompletedDogWalks(c.get("user").id, payload.walks);
    return c.json({ success: true, data });
  } catch (error) {
    return responseError(c, error);
  }
});

const pointSchema = z.object({
  seq: z.number().int().min(1).max(1_000_000),
  segment: z.number().int().min(1).max(100_000),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  timestamp: z.string().datetime({offset:true}),
  accuracy: z.number().finite().min(0).max(100000).nullable(),
  speed: z.number().finite().min(-1).max(200).nullable(),
  accepted: z.boolean(),
  reason: z.enum(["first","ok","invalid","poor_accuracy","out_of_order","jump","stationary"]),
  deltaMeters: z.number().finite().min(0).max(1000),
}).strict();
const gpsBatchSchema = z.object({points:z.array(pointSchema).min(1).max(200)}).strict()
  .superRefine((payload,ctx)=>{
    const seqs=payload.points.map(p=>p.seq);
    if(new Set(seqs).size!==seqs.length) ctx.addIssue({code:"custom",message:"DUPLICATE_SEQ"});
  });

walksRoutes.put("/:clientId/track", async c => {
  const clientId=c.req.param("clientId");
  if(!z.string().uuid().safeParse(clientId).success) return c.json({success:false,code:"INVALID_ID"},400);
  const declared=Number(c.req.header("content-length")??"0");
  if(declared>110000) return c.json({success:false,code:"PAYLOAD_TOO_LARGE"},413);
  const raw=await c.req.text().catch(()=> "");
  if(raw.length>110000) return c.json({success:false,code:"PAYLOAD_TOO_LARGE"},413);
  try {
    const payload=gpsBatchSchema.safeParse(JSON.parse(raw));
    if(!payload.success) return c.json({success:false,code:"INVALID_TRACK"},400);
    const result=await syncDogWalkTrackPoints(c.get("user").id,clientId,payload.data.points);
    return c.json({success:true,data:result});
  } catch(error) {
    if(error instanceof SyntaxError) return c.json({success:false,code:"INVALID_TRACK"},400);
    return responseError(c,error);
  }
});

walksRoutes.get("/:clientId/track", async c => {
  const clientId=c.req.param("clientId");
  const after=Number(c.req.query("afterSeq")??0);
  if(!z.string().uuid().safeParse(clientId).success || !Number.isSafeInteger(after) || after<0) {
    return c.json({success:false,code:"INVALID_TRACK_QUERY"},400);
  }
  try {
    const result=await listDogWalkTrackPoints(c.get("user").id,clientId,after);
    return c.json({success:true,data:result});
  } catch(error) { return responseError(c,error); }
});

walksRoutes.get("/deleted", async c=>{
  try {return c.json({success:true,data:await listDeletedDogWalkIds(c.get("user").id)});}
  catch(error){return responseError(c,error);}
});
walksRoutes.delete("/:clientId",async c=>{
  const clientId=c.req.param("clientId");
  if(!z.string().uuid().safeParse(clientId).success) return c.json({success:false,code:"INVALID_ID"},400);
  try {
    await deleteDogWalk(c.get("user").id,clientId);
    return c.json({success:true,data:{deleted:true}});
  }catch(error){return responseError(c,error);}
});
