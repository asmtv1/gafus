/** Ordinary Questions and Moments READ view only. Never a session or ACL store. */
import { QUESTION_CATEGORIES, type QuestionCategory, type QuestionSort,
  type QuestionStatus } from "@gafus/types";
import { FEED_SORT_OPTIONS, type FeedSort } from "@gafus/types";

export type ReadViewScope = { principal: string; generation: string | null };
export type QuestionsView = {
  search: string; category: QuestionCategory | ""; status: QuestionStatus | "";
  sort: QuestionSort; mine: boolean;
};
export type MomentsView = { sort: FeedSort };
export const DEFAULT_QUESTIONS_VIEW: QuestionsView = {
  search: "", category: "", status: "", sort: "new", mine: false,
};
export const DEFAULT_MOMENTS_VIEW: MomentsView = { sort: "new" };
export const QUESTIONS_HISTORY_VIEW_KEY = "__gafusQuestionsReadViewV1";
export const MOMENTS_HISTORY_VIEW_KEY = "__gafusMomentsReadViewV1";

type ViewKind = "questions" | "moments";
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function listPath(kind: ViewKind): string | null {
  const path = window.location.pathname;
  if (kind === "questions") return path === "/questions" ? path : null;
  // The registered /feed alias renders the same MomentsCatalog, but history
  // entries remain distinct: never migrate saved state between two URLs.
  return path === "/moments" || path === "/feed" ? path : null;
}
const name = (kind: ViewKind) => kind === "questions"
  ? QUESTIONS_HISTORY_VIEW_KEY : MOMENTS_HISTORY_VIEW_KEY;
function savedView(kind: ViewKind, scope: ReadViewScope): unknown {
  const path = listPath(kind);
  if (!path || scope.generation === null || !record(window.history.state)) return null;
  const saved = window.history.state[name(kind)];
  if (!record(saved) || saved.version !== 1 || saved.path !== path ||
    saved.principal !== scope.principal || saved.generation !== scope.generation ||
    saved.kind !== kind) return null;
  return saved.view;
}
function writeView(kind: ViewKind, scope: ReadViewScope, view: QuestionsView | MomentsView) {
  const path = listPath(kind);
  const old: unknown = window.history.state;
  if (!path || scope.generation === null || old !== null && !record(old)) return;
  // replaceState changes only THIS entry. New pushState routes start fresh;
  // preserve unrelated providers' keys, query params and hash unchanged.
  window.history.replaceState({
    ...(old ?? {}),
    [name(kind)]: { version: 1, kind, path,
      principal: scope.principal, generation: scope.generation, view: { ...view } },
  }, "", window.location.href);
}
function questionsView(value: unknown): value is QuestionsView {
  if (!record(value)) return false;
  return typeof value.search === "string" && value.search.length <= 150 &&
    (value.category === "" || QUESTION_CATEGORIES.includes(value.category as QuestionCategory)) &&
    (value.status === "" || ["waiting", "answered", "resolved"].includes(String(value.status))) &&
    ["new", "active", "unanswered"].includes(String(value.sort)) &&
    typeof value.mine === "boolean";
}
function momentsView(value: unknown): value is MomentsView {
  return record(value) && FEED_SORT_OPTIONS.includes(value.sort as FeedSort);
}
export function readQuestionsHistoryView(scope: ReadViewScope): QuestionsView | null {
  const view = savedView("questions", scope);
  return questionsView(view) ? { ...view } : null;
}
export function saveQuestionsHistoryView(scope: ReadViewScope, view: QuestionsView) {
  writeView("questions", scope, view);
}
export function readMomentsHistoryView(scope: ReadViewScope): MomentsView | null {
  const view = savedView("moments", scope);
  return momentsView(view) ? { ...view } : null;
}
export function saveMomentsHistoryView(scope: ReadViewScope, view: MomentsView) {
  writeView("moments", scope, view);
}
