/** Shared, platform-independent contracts for the community questions feature. */
export const QUESTION_CATEGORIES = [
  "Поведение",
  "Дрессировка",
  "Здоровье",
  "Питание",
  "Уход и амуниция",
  "Другое",
] as const;
export const QUESTION_LIMITS = {
  title: 150,
  body: 10000,
  tags: 5,
  photos: 5,
  photoBytes: 10 * 1024 * 1024,
  dailyQuestions: 5,
  hourlyAnswers: 30,
  pageSize: 20,
} as const;
export const QUESTION_REPORT_REASONS = ["Спам", "Оскорбления", "Опасный совет", "Другое"] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];
export type QuestionStatus = "waiting" | "answered" | "resolved";
export type QuestionSort = "new" | "active" | "unanswered";
export interface QuestionAuthorDto {
  id: string;
  name: string;
  /** Optional for compatibility with the previously deployed questions API. */
  username?: string;
  avatarUrl: string | null;
}
export interface QuestionPhotoDto {
  id: string;
  url: string;
}
export interface QuestionInput {
  title: string;
  body: string;
  category: QuestionCategory;
  tags: string[];
  photoIds: string[];
  clientRequestId: string;
}
export interface QuestionAnswerInput {
  body: string;
  photoIds: string[];
  replyToId?: string | null;
  clientRequestId: string;
}
export interface QuestionListQuery {
  search?: string;
  category?: string;
  status?: QuestionStatus | "";
  mine?: boolean;
  sort?: QuestionSort;
  page?: number;
}
export interface QuestionListItemDto {
  id: string;
  title: string;
  body: string;
  category: QuestionCategory;
  tags: string[];
  author: QuestionAuthorDto;
  createdAt: string;
  editedAt: string | null;
  status: QuestionStatus;
  closed: boolean;
  answerCount: number;
  viewCount: number;
  bestAnswer: { id: string; body: string } | null;
}
export interface QuestionListDto {
  items: QuestionListItemDto[];
  nextPage: number | null;
  canPublish: boolean;
  blockReason: string | null;
}
export interface QuestionAnswerDto {
  id: string;
  body: string;
  author: QuestionAuthorDto;
  createdAt: string;
  editedAt: string | null;
  parentId: string | null;
  replyToName: string | null;
  deleted: boolean;
  hidden: boolean;
  replyCount: number;
  photos: QuestionPhotoDto[];
  hearts: number;
  liked: boolean;
  best: boolean;
  canEdit: boolean;
  canDelete: boolean;
}
export interface QuestionDetailDto extends QuestionListItemDto {
  photos: QuestionPhotoDto[];
  answers: QuestionAnswerDto[];
  nextAnswerPage: number | null;
  canManage: boolean;
  canEdit: boolean;
  canReply: boolean;
  isAdmin: boolean;
  blockReason: string | null;
}
export interface QuestionReportDto {
  id: string;
  reason: string;
  details: string;
  createdAt: string;
  questionId: string;
  questionTitle: string;
  photos: QuestionPhotoDto[];
  answerId: string | null;
  body: string;
  author: QuestionAuthorDto;
  reporter: QuestionAuthorDto;
  hidden: boolean;
}
export interface QuestionModerationDto {
  reports: QuestionReportDto[];
  nextPage: number | null;
  blocks: { userId: string; name: string; reason: string }[];
}
/** Transport is injected by web/mobile; business decisions never live in this client. */
export type QuestionsTransport = <T>(
  path: string,
  options?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown },
) => Promise<T>;
export function createQuestionsClient(transport: QuestionsTransport) {
  return {
    list: (query: QuestionListQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined && value !== "") params.set(key, String(value));
      return transport<QuestionListDto>(`?${params}`);
    },
    detail: (id: string, sort = "useful", page = 1) =>
      transport<QuestionDetailDto>(`${encodeURIComponent(id)}?sort=${sort}&page=${page}`),
    replies: (id: string, page = 2) =>
      transport<{ items: QuestionAnswerDto[]; nextPage: number | null }>(
        `answers/${id}/replies?page=${page}`,
      ),
    create: (body: QuestionInput) => transport<{ id: string }>("", { method: "POST", body }),
    edit: (id: string, body: Omit<QuestionInput, "clientRequestId">) =>
      transport(`${id}`, { method: "PATCH", body }),
    remove: (id: string) => transport(`${id}`, { method: "DELETE" }),
    answer: (id: string, body: QuestionAnswerInput) =>
      transport<{ id: string }>(`${id}/answers`, { method: "POST", body }),
    editAnswer: (id: string, body: { body: string; photoIds: string[] }) =>
      transport(`answers/${id}`, { method: "PATCH", body }),
    removeAnswer: (id: string) => transport(`answers/${id}`, { method: "DELETE" }),
    heart: (id: string, liked: boolean) =>
      transport(`answers/${id}/heart`, { method: "POST", body: { liked } }),
    best: (id: string, answerId: string | null) =>
      transport(`${id}/best`, { method: "POST", body: { answerId } }),
    close: (id: string, closed: boolean) =>
      transport(`${id}/close`, { method: "POST", body: { closed } }),
    report: (id: string, body: { answerId?: string; reason: string; details?: string }) =>
      transport(`${id}/reports`, { method: "POST", body }),
  };
}
