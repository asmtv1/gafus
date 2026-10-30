/** AG1-001: exact approved own-article 8-field whitelist, no private projection. */
type OwnArticleRow = {
  id: string;
  title: string;
  slug: string;
  visibility: "PUBLIC" | "PAID";
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
  _count: { articleLikes: number };
};
type TrainerArticleOwnMetadataItem = {
  id: string;
  title: string;
  slug: string;
  visibility: "PUBLIC" | "PAID";
  likeCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

export function createReadTrainerOwnArticleMetadataApplication(dependencies: {
  readRows: (actorUserId: string) => Promise<OwnArticleRow[]>;
}) {
  return {
    async execute({ actorUserId }: { actorUserId: string }) {
      const rows = await dependencies.readRows(actorUserId);
  const articles:TrainerArticleOwnMetadataItem[]=rows.map(row=>{
   if(!row.id||typeof row.title!=="string"||typeof row.slug!=="string"||
    !["PUBLIC","PAID"].includes(row.visibility)||
    !Number.isSafeInteger(row.viewCount)||row.viewCount<0||
    !Number.isSafeInteger(row._count.articleLikes)||row._count.articleLikes<0||
    !(row.createdAt instanceof Date)||!Number.isFinite(row.createdAt.getTime())||
    !(row.updatedAt instanceof Date)||!Number.isFinite(row.updatedAt.getTime()))
    throw new Error("INVALID_ARTICLE_SOURCE");
   return {id:row.id,title:row.title,slug:row.slug,visibility:row.visibility,
    likeCount:row._count.articleLikes,viewCount:row.viewCount,
    createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
  });
      return { articles };
    },
  };
}
