import { afterEach, describe, expect, it, vi } from "vitest";
import { getMyArticle, listMyArticles, registerMyArticleView } from "./articleApi";
const response = (data: unknown) => new Response(
  JSON.stringify({success:true,data}), {status:200},
);
const article = {
  id:"article1", slug:"учебный", title:"Занятия", description:"Анонс",
  visibility:"PAID",hasAccess:false,likeCount:2,authorUsername:"trainer",
  contentType:"HTML",content:null,imageUrls:[],videoUrl:null,
  isLiked:false,createdAt:"2026-10-01T00:00:00Z",
};
afterEach(()=>vi.unstubAllGlobals());
describe("article Web API has only owner-scoped calls",()=>{
  it("catalog only uses authenticated article endpoint",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response([article]));
    vi.stubGlobal("fetch",fetcher);
    const result=await listMyArticles();
    expect(result).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/articles",
      expect.objectContaining({method:"GET",credentials:"include",cache:"no-store"}));
  });
  it("encoded Unicode slug never becomes an anonymous article read",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response(article));
    vi.stubGlobal("fetch",fetcher);
    const result=await getMyArticle("учебный");
    expect(result.content).toBeNull();
    expect(result.imageUrls).toEqual([]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/articles/%D1%83%D1%87%D0%B5%D0%B1%D0%BD%D1%8B%D0%B9",
      expect.objectContaining({method:"GET",credentials:"include"}));
  });
  it("view posts only to authorized endpoint without anonymous visitor key",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response(undefined));
    vi.stubGlobal("fetch",fetcher);
    await registerMyArticleView("учебный");
    const [path,options]=fetcher.mock.calls[0];
    expect(path).toBe("/api/v1/articles/%D1%83%D1%87%D0%B5%D0%B1%D0%BD%D1%8B%D0%B9/view");
    expect(options).toMatchObject({method:"POST",credentials:"include",cache:"no-store"});
    expect(JSON.parse(options.body)).toEqual({});
    expect(JSON.stringify(options)).not.toContain("visitorKey");
  });
  it("invalid slugs fail before any network",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    await expect(getMyArticle("../secret")).rejects.toThrow("Некорректный адрес");
    await expect(registerMyArticleView("%2F")).rejects.toThrow("Некорректный адрес");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
