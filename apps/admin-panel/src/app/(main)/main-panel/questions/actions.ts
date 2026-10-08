"use server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  getQuestionModeration,
  moderateQuestionReport,
  unblockQuestionsUser,
} from "@gafus/core/services/questions";
async function actor() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Не авторизован");
  return session.user.id;
}
export async function loadQuestionModeration(page = 1) {
  return getQuestionModeration(await actor(), page);
}
export async function moderateQuestion(input: unknown) {
  return moderateQuestionReport(await actor(), input);
}
export async function unblockQuestionUser(id: string) {
  return unblockQuestionsUser(await actor(), id);
}
