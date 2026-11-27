import { gafusReward } from "./gafus-reward-instance.js";
import { createQuestionService, type QuestionRewardPorts } from "@gafus/questions-write-server/service";

export { QuestionError } from "@gafus/questions-shared/errors";

export const {
  questionActor,
  requireQuestionAdmin,
  listQuestions,
  getQuestion,
  getQuestionReplies,
  createQuestion,
  editQuestion,
  deleteQuestion,
  createQuestionAnswer,
  editQuestionAnswer,
  deleteQuestionAnswer,
  setQuestionHeart,
  setQuestionBestAnswer,
  setQuestionClosed,
  reportQuestion,
} = createQuestionService({
  // The SQL-owned transaction is still passed unchanged. This cast only
  // bridges the database-neutral Core policy contract at the server boundary.
  awardActivityTx: gafusReward.awardActivityTx as unknown as QuestionRewardPorts["awardActivityTx"],
  awardBonusTx: gafusReward.awardBonusTx as unknown as QuestionRewardPorts["awardBonusTx"],
});
