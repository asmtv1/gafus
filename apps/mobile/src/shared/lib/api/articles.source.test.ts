import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  api: vi.fn(), guestKey: vi.fn(),
}));
vi.mock("./client", () => ({ apiClient: (...args: unknown[]) => mock.api(...args) }));
vi.mock("@/shared/lib/articles/articleGuestVisitorKey", () => ({
  getOrCreateArticleGuestVisitorKey: () => mock.guestKey(),
}));
import { articlesApi, encodedArticleApiSlug } from "./articles";

beforeEach(() => {
  vi.clearAllMocks();
  mock.api.mockResolvedValue({ success: true, data: null });
  mock.guestKey.mockResolvedValue("synthetic-guest-key");
});

describe("original Mobile paid/public article registered HTTP route safety", () => {
  it("encodes a real Unicode/Cyrillic slug once for owner article GET", async () => {
    await articlesApi.getBySlug("собаки-и-кошки");
    expect(mock.api).toHaveBeenCalledOnce();
    expect(mock.api).toHaveBeenCalledWith(
      "/api/v1/articles/" + encodeURIComponent("собаки-и-кошки"),
    );
  });
  it("preserves the same slug identity for original view POST and bound guest visitorKey", async () => {
    await articlesApi.incrementView("собаки-и-кошки");
    expect(mock.guestKey).toHaveBeenCalledOnce();
    expect(mock.api).toHaveBeenCalledOnce();
    expect(mock.api).toHaveBeenCalledWith(
      "/api/v1/articles/" + encodeURIComponent("собаки-и-кошки") + "/view",
      { method: "POST", body: { visitorKey: "synthetic-guest-key" },
        skipAuthRefreshReplay: true },
    );
  });
  it("denies traversal, percent escapes, slash, spaces, CRLF and empty input before network", async () => {
    for (const invalid of ["../admin", "a/b", "%2Fadmin", "a%252Fadmin", "", "a b", "a\nX", "a\\b", "a?b"]) {
      expect(() => encodedArticleApiSlug(invalid)).toThrow("INVALID_ARTICLE_SLUG");
      await expect(articlesApi.getBySlug(invalid)).rejects.toThrow("INVALID_ARTICLE_SLUG");
      await expect(articlesApi.incrementView(invalid)).rejects.toThrow("INVALID_ARTICLE_SLUG");
    }
    expect(mock.api).not.toHaveBeenCalled();
    expect(mock.guestKey).not.toHaveBeenCalled();
  });
  it("rejects forged article ID before changing a like; valid ID routes unchanged", async () => {
    expect(() => articlesApi.toggleLike("foo/bar")).toThrow("INVALID_ARTICLE_ID");
    expect(mock.api).not.toHaveBeenCalled();
    await articlesApi.toggleLike("article_123");
    expect(mock.api).toHaveBeenCalledWith("/api/v1/articles/article_123/like", {
      method: "POST", skipAuthRefreshReplay: true,
    });
  });
  it("scrubs closed paid text/video/images before returning payload to native cache", async () => {
    const unsafe = {
      id: "article-1", slug: "собаки", visibility: "PAID", hasAccess: false,
      content: "PRIVATE_ARTICLE_BODY", videoUrl: "https://hidden.example/video",
      imageUrls: ["https://hidden.example/pic"], description: "public teaser",
    };
    mock.api.mockResolvedValueOnce({ success: true, data: unsafe });
    const read = await articlesApi.getBySlug("собаки");
    expect(read.success).toBe(true);
    expect(read.data).toMatchObject({hasAccess:false, content:null, videoUrl:null, imageUrls:[]});
    expect(JSON.stringify(read)).not.toContain("PRIVATE_ARTICLE_BODY");
    expect(JSON.stringify(read)).not.toContain("hidden.example");
    expect((read.data as {description:string}).description).toBe("public teaser");
  });
  it("scrubs PUBLIC-but-not-entitled details because Core gating applies to ALL articles", async()=>{
    mock.api.mockResolvedValueOnce({success:true,data:{
      id:"public-1",slug:"public-case",visibility:"PUBLIC",hasAccess:false,
      content:"PRIVATE_PUBLIC_WHEN_GATED",videoUrl:"https://hidden.example/v",
      imageUrls:["https://hidden.example/p"],description:"Allowed public teaser",
    }});
    const result=await articlesApi.getBySlug("public-case");
    expect(result.data).toMatchObject({hasAccess:false,content:null,videoUrl:null,imageUrls:[]});
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PUBLIC_WHEN_GATED");
    expect(JSON.stringify(result)).not.toContain("hidden.example");
  });
  it("closed PAID response with missing content is never treated as entitled", async () => {
    mock.api.mockResolvedValueOnce({ success: true, data: {
      id:"a2", visibility:"PAID", hasAccess:true, content:null,
      videoUrl:"https://hidden.example/video", imageUrls:["https://hidden.example/pic"],
    } });
    const read=await articlesApi.getBySlug("article-2");
    expect(read.data).toMatchObject({hasAccess:false,content:null,videoUrl:null,imageUrls:[]});
  });
  it("preserves actual fresh entitled paid content and media without mutation", async () => {
    const allowed={id:"a3",visibility:"PAID",hasAccess:true,content:"REAL_ENTITLED_BODY",
      videoUrl:"https://safe.example/v",imageUrls:["https://safe.example/photo"]};
    mock.api.mockResolvedValueOnce({success:true,data:allowed});
    const read=await articlesApi.getBySlug("ok-article");
    expect(read.data).toEqual(allowed);
  });
  it("binds both writes to the current actor and refuses view before guest-key creation", async () => {
    const current=vi.fn().mockReturnValue(false);
    await expect(articlesApi.incrementView("article-2",current)).rejects.toThrow("ARTICLE_ACTOR_CHANGED");
    expect(mock.guestKey).not.toHaveBeenCalled();
    expect(mock.api).not.toHaveBeenCalled();
    current.mockReturnValue(true);
    await articlesApi.incrementView("article-2",current);
    expect(mock.api.mock.calls[0][1]).toMatchObject({
      method:"POST", skipAuthRefreshReplay:true, requestGuard:current,
    });
    await articlesApi.toggleLike("article_123",current);
    expect(mock.api.mock.calls[1][1]).toMatchObject({
      method:"POST",skipAuthRefreshReplay:true,requestGuard:current,
    });
  });
  it("preserves existing article list endpoint and rejects excessive slug length", async () => {
    await articlesApi.getAll();
    expect(mock.api).toHaveBeenCalledWith("/api/v1/articles");
    expect(() => encodedArticleApiSlug("a".repeat(121))).toThrow("INVALID_ARTICLE_SLUG");
  });
});
