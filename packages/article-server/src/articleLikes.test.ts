import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({
  transaction:vi.fn(), lock:vi.fn(), find:vi.fn(), create:vi.fn(), remove:vi.fn(), article:vi.fn(),
}));
vi.mock("@gafus/prisma",()=>({prisma:{
  $transaction:m.transaction,
  article:{findUnique:m.article},
}}));
import {articleExists,toggleArticleLikeAtomic} from "./articleLikes.js";
beforeEach(()=>{
  vi.clearAllMocks();
  m.article.mockResolvedValue({id:"article"});
  m.transaction.mockImplementation(async(fn:(tx:unknown)=>Promise<unknown>)=>fn({
    $queryRaw:m.lock, articleLike:{findUnique:m.find,create:m.create,delete:m.remove},
  }));
});
describe("article-like owner-scoped atomic persistence",()=>{
  it("takes the advisory lock inside the transaction before finding or creating the like",async()=>{
    m.find.mockResolvedValue(null);
    m.create.mockResolvedValue({});
    expect(await toggleArticleLikeAtomic("actor","article")).toBe(true);
    expect(m.transaction).toHaveBeenCalledOnce();
    expect(m.lock).toHaveBeenCalledOnce();
    expect(m.find).toHaveBeenCalledWith({where:{userId_articleId:{userId:"actor",articleId:"article"}},select:{userId:true}});
    expect(m.create).toHaveBeenCalledExactlyOnceWith({data:{userId:"actor",articleId:"article"}});
    expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.find.mock.invocationCallOrder[0]);
    expect(m.find.mock.invocationCallOrder[0]).toBeLessThan(m.create.mock.invocationCallOrder[0]);
  });
  it("deletes the locked pair if it already exists",async()=>{
    m.find.mockResolvedValue({userId:"actor"});
    expect(await toggleArticleLikeAtomic("actor","article")).toBe(false);
    expect(m.remove).toHaveBeenCalledExactlyOnceWith({where:{userId_articleId:{userId:"actor",articleId:"article"}}});
    expect(m.create).not.toHaveBeenCalled();
  });
  it("fails closed before opening SQL without both identifiers",async()=>{
    await expect(toggleArticleLikeAtomic("","article")).rejects.toThrow("ARTICLE_LIKE_ACTOR_OR_ARTICLE_MISSING");
    await expect(toggleArticleLikeAtomic("actor","")).rejects.toThrow("ARTICLE_LIKE_ACTOR_OR_ARTICLE_MISSING");
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("finds only one explicit article id",async()=>{
    expect(await articleExists("article")).toBe(true);
    expect(m.article).toHaveBeenCalledExactlyOnceWith({where:{id:"article"},select:{id:true}});
    m.article.mockResolvedValueOnce(null);
    expect(await articleExists("deleted")).toBe(false);
    expect(await articleExists("")).toBe(false);
    expect(m.article).toHaveBeenCalledTimes(2);
  });
});
