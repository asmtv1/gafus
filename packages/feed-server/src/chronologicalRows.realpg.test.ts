/** Disposable PostgreSQL parity for the extracted production chronological reader.
 * Run only with scripts/qa/feed-chronological-isolated-pg.sh; never production. */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { prisma } from "@gafus/prisma";
import { readChronologicalFeedRows } from "./chronologicalRows.js";
import { smartRetrievalRows } from "./smartRetrievalRows.js";
import { smartRankingRows } from "./smartRankingRows.js";

const safe = (() => {
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    return process.env.GAFUS_FEED_QA === "1" && u.hostname === "127.0.0.1" &&
      u.username === "qafeed" && u.protocol === "postgresql:" && Number(u.port) > 10000 &&
      /^feed_parity_[a-f0-9]{12}$/.test(u.pathname.slice(1)) &&
      process.env.GAFUS_FEED_QA_DB_NAME === u.pathname.slice(1);
  } catch { return false; }
})();
const suite = safe ? describe : describe.skip;
let viewer = "", other = "", firstAuthor = "", hiddenAuthor = "";
let visibleIds: string[] = [], hiddenId = "";
const published = new Date("2026-11-15T10:00:00Z");
const include = { author: { select: { id: true, username: true, role: true,
  profile: { select: { fullName: true, avatarUrl: true } },
} } } as const;
async function oldQuery(actorId: string, bookmarksOnly: boolean, cursor: {date: Date;id:string} | null, pageSize:number) {
  return prisma.feedPost.findMany({
    where: { status:"published", deletedAt:null, moderationState:"visible", publishedAt:{not:null},
      ...(bookmarksOnly ? {bookmarks:{some:{userId:actorId}}} :
        {author:{feedSubscribers:{none:{userId:actorId,hidden:true}}}}),
      ...(cursor ? { OR:[{publishedAt:{lt:cursor.date}},
        {publishedAt:cursor.date,id:{lt:cursor.id}}] } : {}),
    }, include, orderBy:[{publishedAt:"desc"},{id:"desc"}],take:pageSize+1,
  });
}
suite("isolated PostgreSQL chronological feed reader parity",()=>{
  beforeAll(async()=>{
    const [db]=await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
    expect(db?.db).toBe(process.env.GAFUS_FEED_QA_DB_NAME);
    await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
    const seed=randomUUID().slice(0,8);
    const owner=await prisma.user.create({data:{username:`feedqa-owner-${seed}`,password:"no-login"}});
    const hidden=await prisma.user.create({data:{username:`feedqa-hidden-${seed}`,password:"no-login"}});
    const reader=await prisma.user.create({data:{username:`feedqa-viewer-${seed}`,password:"no-login"}});
    const another=await prisma.user.create({data:{username:`feedqa-other-${seed}`,password:"no-login"}});
    firstAuthor=owner.id;hiddenAuthor=hidden.id;viewer=reader.id;other=another.id;
    await prisma.feedAuthorPreference.create({data:{userId:viewer,authorId:hiddenAuthor,hidden:true}});
    const post=async (authorId:string,index:number,status:"published"|"draft"="published",opts:{moderationState?:string;deletedAt?:Date}={})=>{
      const id=randomUUID();
      await prisma.feedPost.create({data:{id,authorId,clientRequestId:`feed-qa-${index}-${id.slice(0,8)}`,
        status, moderationState:opts.moderationState??"visible",deletedAt:opts.deletedAt??null,
        publishedAt:new Date(published.getTime()+Math.floor(index/2)*1000)}});
      return id;
    };
    for(let i=0;i<9;i++) visibleIds.push(await post(firstAuthor,i));
    hiddenId=await post(hiddenAuthor,10);
    await post(firstAuthor,11,"draft");
    await post(firstAuthor,12,"published",{moderationState:"hidden"});
    await post(firstAuthor,13,"published",{deletedAt:new Date()});
    await prisma.feedBookmark.createMany({data:[{userId:viewer,postId:visibleIds[0]!},
      {userId:viewer,postId:hiddenId}]});
  });
  afterAll(async()=>{await prisma.$disconnect();});
  it("matches original projection for both viewers and bookmark ACLs",async()=>{
    for(const actorId of [viewer,other]) for(const bookmarksOnly of [false,true]){
      const [oldRows,newRows]=await Promise.all([
        oldQuery(actorId,bookmarksOnly,null,20),
        readChronologicalFeedRows({actorId,bookmarksOnly,cursor:null,pageSize:20}),
      ]);
      expect(newRows).toEqual(oldRows);
    }
    const visible = await readChronologicalFeedRows({actorId:viewer,bookmarksOnly:false,cursor:null,pageSize:30});
    expect(visible.map(r=>r.id)).not.toContain(hiddenId);
    expect(visible).toHaveLength(9);
    const bookmarked=await readChronologicalFeedRows({actorId:viewer,bookmarksOnly:true,cursor:null,pageSize:30});
    expect(bookmarked.map(r=>r.id).sort()).toEqual([visibleIds[0]!,hiddenId].sort());
  });
  it("ranking readRecent + signal context use only caller-visible posts and reset cutoff",async()=>{
    const at=new Date("2026-11-16T10:00:00Z");
    const [visible,otherVisible]=await Promise.all([
      smartRankingRows.readRecent(viewer,at),
      smartRankingRows.readRecent(other,at),
    ]);
    expect(visible.map(post=>post.id).sort()).toEqual(visibleIds.slice().sort());
    expect(visible.map(post=>post.id)).not.toContain(hiddenId);
    expect(otherVisible.map(post=>post.id)).toContain(hiddenId);
    const context=await smartRankingRows.readSignals(viewer,at,
      visible.map(post=>post.id),[firstAuthor],{
        useBehavior:false,historyResetAt:published,materializedAffinity:false,
      });
    expect(context.viewer?.pets).toBeDefined();
    expect(context.authors.map(author=>author.id)).toEqual([firstAuthor]);
    expect(context.materialized).toHaveLength(0);
    expect(context.reactions).toHaveLength(0);
    expect(context.comments).toHaveLength(0);
    expect(context.bookmarks).toHaveLength(0);
  });
  it("multi-source smart retrieval uses identical viewer/hidden-author/moderation ACLs",async()=>{
    const at=new Date("2026-11-16T10:00:00Z");
    const options={useCity:false,usePets:false,useBehavior:false};
    const [viewerSources,otherSources]=await Promise.all([
      smartRetrievalRows.readCandidateSources(viewer,at,options),
      smartRetrievalRows.readCandidateSources(other,at,options),
    ]);
    expect(viewerSources.map(group=>group.source))
      .toEqual(["recent","local","pet","affinity","trending"]);
    const recentViewer=viewerSources[0]!.posts.map(row=>row.id);
    expect(recentViewer.slice().sort()).toEqual(visibleIds.slice().sort());
    expect(recentViewer).not.toContain(hiddenId);
    const recentOther=otherSources[0]!.posts.map(row=>row.id);
    expect(recentOther).toContain(hiddenId);
    expect(recentOther).toHaveLength(visibleIds.length+1);
    expect(viewerSources[1]!.posts).toHaveLength(0);
    expect(viewerSources[2]!.posts).toHaveLength(0);
    expect(viewerSources[3]!.posts).toHaveLength(0);
  });
  it("preserves equal-timestamp keyset order without duplicates across page sizes",async()=>{
    for(const pageSize of [1,2,3,4,8]){
      let cursor: {date:Date;id:string}|null=null;
      const fetched:string[]=[];
      for(let page=0;page<16;page++){
        const newRows=await readChronologicalFeedRows({actorId:viewer,bookmarksOnly:false,cursor,pageSize});
        const originalRows=await oldQuery(viewer,false,cursor,pageSize);
        expect(newRows.map(r=>r.id)).toEqual(originalRows.map(r=>r.id));
        const current=newRows.slice(0,pageSize);
        fetched.push(...current.map(r=>r.id));
        if(newRows.length<=pageSize)break;
        const last=current.at(-1)!;
        cursor={date:last.publishedAt!,id:last.id};
      }
      expect(new Set(fetched).size).toBe(9);
      expect(fetched).toHaveLength(9);
    }
  });
  it("does not increase SQL query count as pageSize increases",async()=>{
    // This isolated QA role owns the disposable PG cluster. No production
    // stats are queried or reset. pg_stat_statements is preloaded by launcher.
    const reset=async()=>{
      await prisma.$queryRaw`SELECT pg_stat_statements_reset()`;
    };
    const calls=async()=>{
      const [{calls}]=await prisma.$queryRaw<{calls:bigint}[]>`
        SELECT COALESCE(SUM(calls),0)::bigint AS calls
        FROM pg_stat_statements
        WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
          AND position('Feed' || 'Post' in query)>0`;
      return Number(calls);
    };
    const measurements=[] as {pageSize:number;oldCalls:number;newCalls:number}[];
    for(const pageSize of [1,9]){
      await reset();
      await oldQuery(viewer,false,null,pageSize);
      const oldCalls=await calls();
      await reset();
      await readChronologicalFeedRows({actorId:viewer,bookmarksOnly:false,cursor:null,pageSize});
      const newCalls=await calls();
      measurements.push({pageSize,oldCalls,newCalls});
      expect(oldCalls).toBeGreaterThan(0);
      expect(newCalls).toBe(oldCalls);
    }
    expect(measurements[0]?.newCalls).toBe(measurements[1]?.newCalls);
    console.log("FEED_CHRONOLOGICAL_PG_SQL_COUNTS",JSON.stringify(measurements));
  });
  it("records a measured old/new SQL read duration on identical local fixture",async()=>{
    const measurements=[] as {adapter:string,rows:number,elapsedMs:number}[];
    // Both paths issue one top-level Prisma findMany per call; Prisma may issue
    // more than one SQL statement for relation materialization: not measured here.
    for(const [adapter,run] of [
      ["old",()=>oldQuery(viewer,false,null,9)],
      ["new",()=>readChronologicalFeedRows({actorId:viewer,bookmarksOnly:false,cursor:null,pageSize:9})],
    ] as const){
      const started=performance.now();
      const rows=await run();
      measurements.push({adapter,rows:rows.length,elapsedMs:Number((performance.now()-started).toFixed(3))});
    }
    expect(measurements[0]?.rows).toBe(measurements[1]?.rows);
    console.log("FEED_CHRONOLOGICAL_PG_PARITY_METRICS",JSON.stringify(measurements));
  });
});
