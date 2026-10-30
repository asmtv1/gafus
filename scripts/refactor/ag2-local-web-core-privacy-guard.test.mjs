import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkPublishedCoursePrivacy } from "./ag2-local-web-core-privacy-guard.mjs";
const scoped = [
  'favoritedBy: {',
  '  where: { userId: userId ?? "" },',
  '  select: { userId: true },',
  '},',
  'favoritedBy: course.favoritedBy.filter((member) => !!userId && member.userId === userId),',
  'isFavorite: favoriteCourseIds.has(course.id),',
].join("\n");
const index = 'export * from "./courseService.js";';
const pkg = { exports: { "./services/course": {
  default: "./dist/core/src/services/course/index.js",
} } };
function check(artifact = scoped, i = index, p = pkg) {
  return checkPublishedCoursePrivacy({ artifact, index: i, pkg: p });
}
describe("local original Web Hono published Core privacy preflight", () => {
  it("passes scoped selection, filtered wire and current-viewer favorite", () => {
    assert.equal(check(), true);
  });
  it("rejects old published dist with unscoped relation", () => {
    assert.throws(() => check("favoritedBy: true,\n" + scoped), /unscoped_favorite_query/);
  });
  it("rejects missing per-actor where or select", () => {
    assert.throws(() => check(scoped.replace('where: { userId: userId ?? "" },', "")),
      /missing_owner_scoped_favorite_select/);
    assert.throws(() => check(scoped.replace("select: { userId: true },", "")),
      /missing_owner_scoped_favorite_select/);
  });
  it("rejects unfiltered wire even with scoped query", () => {
    assert.throws(() => check(scoped.replace(
      "course.favoritedBy.filter((member) => !!userId && member.userId === userId)",
      "course.favoritedBy",
    )), /missing_defensive_favorite_filter/);
  });
  it("rejects missing independent isFavorite", () => {
    assert.throws(() => check(scoped.replace(
      "isFavorite: favoriteCourseIds.has(course.id)", "isFavorite: false",
    )), /lost_isFavorite/);
  });
  it("rejects changed published index or package export", () => {
    assert.throws(() => check(scoped, "export * from './other.js';"),
      /missing_course_index_export/);
    assert.throws(() => check(scoped, index, { exports: {} }),
      /unexpected_published_package_entry/);
  });
  it("rejects empty and incomplete artifact before Web startup", () => {
    assert.throws(() => check(""), /missing_owner_scoped_favorite_select/);
    assert.throws(() => checkPublishedCoursePrivacy({
      artifact: undefined, index: "", pkg,
    }), /missing_artifact/);
  });
});
