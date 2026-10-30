/** AG1-001: bind only approved own-article minimal metadata producer. */
import { readTrainerOwnArticleMetadataRows } from "../infrastructure/read-own-article-metadata-rows.js";
import { createReadTrainerOwnArticleMetadataApplication } from "../application/read-own-article-metadata.js";

export const readTrainerOwnArticleMetadataApplication =
  createReadTrainerOwnArticleMetadataApplication({
    readRows: readTrainerOwnArticleMetadataRows,
  });
