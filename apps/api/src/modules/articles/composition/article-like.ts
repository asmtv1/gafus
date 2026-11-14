/**
 * Article-like API composition: same existing SQL advisory-locked toggle.
 * The Core policy must first resolve article-specific subscription or
 * rewarded access; neither query port accepts client-selected user IDs.
 */
import {
  toggleArticleLikeWithMonetizedAccess as coreToggle,
  type ArticleLikeInput,
  type ArticleLikePorts,
} from "@gafus/core/services/article";
import { articleExists, toggleArticleLikeAtomic } from "@gafus/article-server/likes";

const persistence: ArticleLikePorts = { articleExists, toggleArticleLikeAtomic };

export function toggleArticleLikeWithMonetizedAccess(input: ArticleLikeInput): Promise<boolean> {
  return coreToggle(input, persistence);
}
