/** AG1-001: approved author-only metadata query, no content/student/media. */
import { prisma } from "@gafus/prisma";

export function readTrainerOwnArticleMetadataRows(actorUserId: string) {
  return prisma.article.findMany({
    where:{authorId:actorUserId},orderBy:[{createdAt:"desc"},{id:"desc"}],take:100,
    select:{id:true,title:true,slug:true,visibility:true,viewCount:true,
      createdAt:true,updatedAt:true,_count:{select:{articleLikes:true}}},
  });
}
