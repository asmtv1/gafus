/** Real transaction-level acceptance, disposable PostgreSQL on loopback only. */
import assert from "node:assert/strict";
import { prisma } from "@gafus/prisma";
import { articleExists, toggleArticleLikeAtomic } from "@gafus/article-server/likes";
import {getArticleAuthorId,updateOwnedArticle,deleteOwnedArticle} from "@gafus/article-server";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    process.env.GAFUS_ARTICLE_LIKE_REAL_PG !== "1" ||
    url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
    url.pathname !== "/gafus_refactor_article_likes")
  throw new Error("REFUSING_NON_DISPOSABLE_ARTICLE_DB");

async function main() {
  const [a,b]=await Promise.all([
    prisma.user.create({data:{username:"like_owner_a",password:"synthetic-disposable"}}),
    prisma.user.create({data:{username:"like_owner_b",password:"synthetic-disposable"}}),
  ]);
  const article=await prisma.article.create({data:{
    authorId:a.id,title:"Local concurrency acceptance",content:"synthetic",slug:"local-like-test",
  }});
  assert.equal(await articleExists(article.id),true);
  assert.equal(await articleExists("missing"),false);
  const make=()=>toggleArticleLikeAtomic(a.id,article.id);
  const concurrent=await Promise.all(Array.from({length:12},make));
  assert.equal(concurrent.filter(Boolean).length,6);
  assert.equal(concurrent.filter(x=>!x).length,6);
  assert.equal(await prisma.articleLike.count({where:{userId:a.id,articleId:article.id}}),0,
    "even number of concurrent toggles must restore unliked state");
  assert.equal(await make(),true);
  assert.equal(await prisma.articleLike.count({where:{userId:a.id,articleId:article.id}}),1);
  assert.equal(await toggleArticleLikeAtomic(b.id,article.id),true);
  assert.equal(await prisma.articleLike.count({where:{articleId:article.id}}),2);
  assert.equal(await make(),false);
  assert.equal(await prisma.articleLike.count({where:{articleId:article.id}}),1);
  assert.equal(await prisma.articleLike.findUnique({where:{userId_articleId:{userId:b.id,articleId:article.id}}})!==null,true,
    "another actor's like must not be removed by the first actor");
  await assert.rejects(toggleArticleLikeAtomic("",article.id),/ARTICLE_LIKE_ACTOR_OR_ARTICLE_MISSING/);
  assert.equal(await getArticleAuthorId(article.id),a.id);
  assert.equal(await updateOwnedArticle(article.id,b.id,{title:"not owned"}),false);
  assert.equal((await prisma.article.findUniqueOrThrow({where:{id:article.id}})).title,"Local concurrency acceptance");
  assert.equal(await deleteOwnedArticle(article.id,b.id),false);
  assert.equal(await updateOwnedArticle(article.id,a.id,{title:"owner accepted"}),true);
  await prisma.article.update({where:{id:article.id},data:{authorId:b.id}});
  // Simulates a stale authorize/read followed by a different committed owner.
  assert.equal(await updateOwnedArticle(article.id,a.id,{title:"stale owner rejected"}),false);
  assert.equal(await deleteOwnedArticle(article.id,a.id),false);
  assert.equal((await prisma.article.findUniqueOrThrow({where:{id:article.id}})).title,"owner accepted");
  assert.equal(await updateOwnedArticle(article.id,b.id,{title:"new owner accepted"}),true);
  assert.equal(await deleteOwnedArticle(article.id,b.id),true);
  assert.equal(await articleExists(article.id),false);
  console.log("ARTICLE_LIKE_REAL_PG_PASS: 12 concurrent tx pair locks, 6/6 toggles, composite PK, owner isolation, stale-author update/delete denied, rejection before SQL");
}
main().then(async()=>prisma.$disconnect())
  .catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
