import { describe, expect, it } from "vitest";
import {
  QuestionError as ServerQuestionError,
  questionHttpError as serverErrorMapper,
} from "./errors";
import {
  questionCreateSchema as serverQuestionCreate,
  answerCreateSchema as serverAnswerCreate,
} from "./schemas";
import {
  QuestionError as SharedQuestionError,
  questionHttpError as sharedErrorMapper,
} from "@gafus/questions-shared/errors";
import {
  questionCreateSchema as sharedQuestionCreate,
  answerCreateSchema as sharedAnswerCreate,
} from "@gafus/questions-shared/schemas";

describe("Question SQL adapter preserves compiled shared contracts", () => {
  it("keeps one class identity across Core, worker, and SQL writer imports", () => {
    expect(ServerQuestionError).toBe(SharedQuestionError);
    expect(serverErrorMapper).toBe(sharedErrorMapper);
    const known = new ServerQuestionError("QUESTION_FORBIDDEN", "Нет доступа", 403);
    expect(sharedErrorMapper(known).status).toBe(403);
  });
  it("does not fork the public Zod schema objects", () => {
    expect(serverQuestionCreate).toBe(sharedQuestionCreate);
    expect(serverAnswerCreate).toBe(sharedAnswerCreate);
  });
});
