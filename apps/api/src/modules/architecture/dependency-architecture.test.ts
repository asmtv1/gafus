/**
 * AG1-001 executable *source* architecture boundary. No runtime graph imports.
 * Constrained to thirty-two approved API application modules, thirty-one composition
 * roots and seventeen registered Hono adapters. No blanket legacy route rule.
 */
import { lstatSync, readFileSync, realpathSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Sources = Record<string, string>;
type Wiring = {
  module: string; route: string; exportName: string; factory: string;
  application: string; ports: Record<string, string>; repository?: string;
  runtimeServiceModule?: string;
};
const WIRINGS: readonly Wiring[] = [
  { module:"modules/user/composition/profile.ts",
    route:"routes/v1/user.ts", exportName:"readProfileApplication",
    factory:"createReadProfileApplication",
    application:"modules/user/application/read-profile.ts",
    ports:{loadProfile:"getUserProfileForApi"} },
  { module:"modules/user/composition/profile.ts",
    route:"routes/v1/user.ts", exportName:"updateProfileApplication",
    factory:"createUpdateProfileApplication",
    application:"modules/user/application/update-profile.ts",
    ports:{persist:"updateUserProfile"} },
  { module:"modules/user/composition/onboarding-tour.ts",
    route:"routes/v1/user.ts", exportName:"onboardingTourApplication",
    factory:"createOnboardingTourApplication",
    application:"modules/user/application/onboarding-tour.ts",
    ports:{readStatus:"getOnboardingTourStatus", markSeen:"markOnboardingTourSeen"} },
  { module:"modules/user/composition/read-public-profile.ts",
    route:"routes/v1/user.ts", exportName:"readPublicProfileApplication",
    factory:"createReadPublicProfileApplication",
    application:"modules/user/application/read-public-profile.ts",
    ports:{loadPublicProfile:"getPublicProfile"} },
  { module:"modules/consultations/composition/list-cynologists.ts",
    route:"routes/v1/consultations.ts", exportName:"listCynologistsApplication",
    factory:"createListCynologistsApplication",
    application:"modules/consultations/application/list-cynologists.ts",
    ports:{listListedCynologists:"listListedCynologists",
      getBookingEligibility:"getConsultationBookingEligibility"} },
  { module:"modules/training/composition/read-training-day.ts",
    route:"routes/v1/training.ts", exportName:"readTrainingDayApplication",
    factory:"createReadTrainingDayApplication",
    application:"modules/training/application/read-training-day.ts",
    ports:{readDay:"getTrainingDayWithMonetizedSteps",
      checkAccess:"checkCourseAccess"} },
  { module:"modules/courses/composition/read-courses.ts",
    route:"routes/v1/courses.ts", exportName:"courseReadApplication",
    factory:"createCourseReadApplication",
    application:"modules/courses/application/read-courses.ts",
    ports:{catalog:"getCoursesWithProgress", favorites:"getFavoritesCourses",
      metadata:"getCourseMetadata", reviews:"getCourseReviews"} },
  { module:"modules/courses/composition/read-access.ts",
    route:"routes/v1/courses.ts", exportName:"readCourseAccessApplication",
    factory:"createReadCourseAccessApplication",
    application:"modules/courses/application/read-access.ts",
    ports:{byType:"checkCourseAccess", byId:"checkCourseAccessById"} },
  { module:"modules/courses/composition/write-personalization.ts",
    route:"routes/v1/courses.ts", exportName:"writeCoursePersonalizationApplication",
    factory:"createWriteCoursePersonalizationApplication",
    application:"modules/courses/application/write-personalization.ts",
    ports:{persist:"saveCoursePersonalization"} },
  { module:"modules/courses/composition/write-favorite.ts",
    route:"routes/v1/courses.ts", exportName:"writeFavoriteApplication",
    factory:"createWriteFavoriteApplication",
    application:"modules/courses/application/write-favorite.ts",
    ports:{add:"addFavoriteCourse", remove:"removeFavoriteCourse",
      toggle:"toggleFavoriteCourse"} },
  { module:"modules/courses/composition/write-reviews.ts",
    route:"routes/v1/courses.ts", exportName:"writeReviewsApplication",
    factory:"createWriteReviewsApplication",
    application:"modules/courses/application/write-reviews.ts",
    ports:{create:"createCourseReview", rate:"rateCourse",
      update:"updateCourseReview", remove:"deleteCourseReview"} },
  { module:"modules/pets/composition/read-pets.ts",
    route:"routes/v1/pets.ts", exportName:"readPetsApplication",
    factory:"createReadPetsApplication",
    application:"modules/pets/application/read-pets.ts",
    ports:{readList:"getUserPets", readDetail:"getPetById"} },
  { module:"modules/training/composition/read-training-days.ts",
    route:"routes/v1/training.ts", exportName:"readTrainingDaysApplication",
    factory:"createReadTrainingDaysApplication",
    application:"modules/training/application/read-training-days.ts",
    ports:{readDays:"getTrainingDays"} },
  { module:"modules/achievements/composition/read-achievements.ts",
    route:"routes/v1/achievements.ts", exportName:"readAchievementsApplication",
    factory:"createReadAchievementsApplication",
    application:"modules/achievements/application/read-achievements.ts",
    // Achievements was extracted from Core into its approved server-only package.
    runtimeServiceModule:"@gafus/achievements-server",
    ports:{readStats:"getAchievementStats", readTrainingDates:"getUserTrainingDates"} },
  { module:"modules/training/composition/read-diary.ts",
    route:"routes/v1/training.ts", exportName:"readDiaryApplication",
    factory:"createReadDiaryApplication",
    application:"modules/training/application/read-diary.ts",
    ports:{readDiary:"getDiaryEntries"} },
  { module:"modules/training/composition/write-diary.ts",
    route:"routes/v1/training.ts", exportName:"writeDiaryApplication",
    factory:"createWriteDiaryApplication",
    application:"modules/training/application/write-diary.ts",
    ports:{save:"saveDiaryEntry"} },
  { module:"modules/training/composition/write-step-progress.ts",
    route:"routes/v1/training.ts", exportName:"writeStepProgressApplication",
    factory:"createWriteStepProgressApplication",
    application:"modules/training/application/write-step-progress.ts",
    ports:{updateStep:"updateStepAndDay"} },
  { module:"modules/student-notes/composition/read-student-notes.ts",
    route:"routes/v1/notes.ts", exportName:"readStudentNotesApplication",
    factory:"createReadStudentNotesApplication",
    application:"modules/student-notes/application/read-student-notes.ts",
    ports:{readNotes:"getStudentNotes"} },
  { module:"modules/surveys/composition/read-surveys.ts",
    route:"routes/v1/surveys.ts", exportName:"readSurveysApplication",
    factory:"createReadSurveysApplication",
    application:"modules/surveys/application/read-surveys.ts",
    ports:{comparison:"getSurveyComparison", template:"getSurveyTemplate",
      response:"getSurveyResponse"} },
  { module:"modules/surveys/composition/write-response.ts",
    route:"routes/v1/surveys.ts", exportName:"writeSurveyResponseApplication",
    factory:"createWriteSurveyResponseApplication",
    application:"modules/surveys/application/write-response.ts",
    ports:{submit:"submitSurveyResponse"} },
  { module:"modules/exam/composition/read-result.ts",
    route:"routes/v1/exam.ts", exportName:"readExamResultApplication",
    factory:"createReadExamResultApplication",
    application:"modules/exam/application/read-result.ts",
    ports:{readResult:"getExamResult"} },
  { module:"modules/exam/composition/write-submit.ts",
    route:"routes/v1/exam.ts", exportName:"writeExamSubmitApplication",
    factory:"createWriteExamSubmitApplication",
    application:"modules/exam/application/write-submit.ts",
    ports:{submit:"submitExamResult"} },
  { module:"modules/learner-daily/composition/read-today-daily-course.ts",
    route:"routes/v1/daily-course.ts", exportName:"readTodayDailyCourseApplication",
    factory:"createReadTodayDailyCourseApplication",
    application:"modules/learner-daily/application/read-today-daily-course.ts",
    ports:{readToday:"getTodayDailyCourse"} },
  { module:"modules/learner-daily/composition/day-and-step-commands.ts",
    route:"routes/v1/daily-course.ts", exportName:"dayAndStepCommandsApplication",
    factory:"createDayAndStepCommandsApplication",
    application:"modules/learner-daily/application/day-and-step-commands.ts",
    ports:{readOrCreateDay:"getDailyCourseDayWithUserSteps",
      updateStep:"updateDailyCourseStepAndDay"} },
  { module:"modules/pet-prevention/composition/journal.ts",
    route:"routes/v1/pet-prevention.ts", exportName:"preventionJournalApplication",
    factory:"createPreventionJournalApplication",
    application:"modules/pet-prevention/application/journal.ts",
    ports:{list:"getEntriesByPet", create:"createEntry",
      batch:"upsertPreventionEntriesBatch", update:"updateEntry", remove:"deleteEntry"} },
  { module:"modules/trainer-notes/composition/read-notes-summary.ts",
    route:"routes/v1/trainer-notes-summary.ts",
    exportName:"readTrainerNotesSummaryApplication",
    factory:"createReadTrainerNotesSummaryApplication",
    application:"modules/trainer-notes/application/read-notes-summary.ts",
    repository:"modules/trainer-notes/infrastructure/read-notes-summary-snapshot.ts",
    ports:{readSnapshot:"readTrainerNotesSummarySnapshot"} },
  { module:"modules/trainer-articles/composition/read-own-article-metadata.ts",
    route:"routes/v1/trainer-articles-own-summary.ts",
    exportName:"readTrainerOwnArticleMetadataApplication",
    factory:"createReadTrainerOwnArticleMetadataApplication",
    application:"modules/trainer-articles/application/read-own-article-metadata.ts",
    repository:"modules/trainer-articles/infrastructure/read-own-article-metadata-rows.ts",
    ports:{readRows:"readTrainerOwnArticleMetadataRows"} },
  { module:"modules/trainer-exam/composition/read-trainer-exam-metadata.ts",
    route:"routes/v1/trainer-exam-summary.ts",
    exportName:"readTrainerExamMetadataApplication",
    factory:"createReadTrainerExamMetadataApplication",
    application:"modules/trainer-exam/application/read-trainer-exam-metadata.ts",
    ports:{examResults:"getExamResults", pendingExamResults:"getPendingExamResults"} },
  { module:"modules/trainer-daily/composition/read-trainer-daily.ts",
    route:"routes/v1/trainer-daily-bundles.ts",
    exportName:"readTrainerDailyApplication",
    factory:"createReadTrainerDailyApplication",
    application:"modules/trainer-daily/application/read-trainer-daily.ts",
    ports:{readBundles:"getDailyCourseBundles",
      readBundleStepCandidates:"getDailyCourseBundleStepCandidates",
      readScheduleRange:"getDailyCourseScheduleRange",
      readCandidates:"getDailyCourseCandidates"} },
  { module:"modules/trainer-days/composition/read-visible-days.ts",
    route:"routes/v1/trainer-days.ts",
    exportName:"readVisibleDaysApplication",
    factory:"createReadVisibleDaysApplication",
    application:"modules/trainer-days/application/read-visible-days.ts",
    ports:{readVisibleDays:"getVisibleDays"} },
  { module:"modules/trainer-statistics/composition/read-trainer-statistics.ts",
    route:"routes/v1/trainer-statistics.ts",
    exportName:"readTrainerStatisticsApplication",
    factory:"createReadTrainerStatisticsApplication",
    application:"modules/trainer-statistics/application/read-trainer-statistics.ts",
    ports:{readCourses:"getCourseStatistics", readSteps:"getStepStatistics"} },
  { module:"modules/trainer-steps/composition/read-visible-steps.ts",
    route:"routes/v1/trainer-steps.ts",
    exportName:"readVisibleStepsApplication",
    factory:"createReadVisibleStepsApplication",
    application:"modules/trainer-steps/application/read-visible-steps.ts",
    ports:{readSteps:"getVisibleSteps"} },
  { module:"modules/trainer-templates/composition/read-public-templates.ts",
    route:"routes/v1/trainer-templates.ts",
    exportName:"readPublicTemplatesApplication",
    factory:"createReadPublicTemplatesApplication",
    application:"modules/trainer-templates/application/read-public-templates.ts",
    ports:{readTemplates:"getStepTemplates"} },
  { module:"modules/trainer-courses/composition/read-course-editor.ts",
    route:"routes/v1/trainer-courses.ts",
    exportName:"readCourseEditorApplication",
    factory:"createReadCourseEditorApplication",
    application:"modules/trainer-courses/application/read-course-editor.ts",
    ports:{readDraft:"getCourseDraftWithRelations",
      readEditorSnapshot:"getCourseEditorSnapshot"} },
];

const applicationSource = (file:string) =>
  /^modules\/[^/]+\/application\/[^/]+\.ts$/.test(file) &&
  !file.endsWith(".test.ts");
const isCallOrNew = (node:ts.Expression) =>
  ts.isCallExpression(node) || ts.isNewExpression(node);
const isForbiddenGlobalCall = (node:ts.Node):boolean =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  ["fetch", "require", "eval"].includes(node.expression.text);

function importsIn(file:ts.SourceFile) {
  return file.statements.filter(ts.isImportDeclaration).map(node=>({
    declaration:node,
    specifier:ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier.text : "",
    runtime:!(node.importClause?.isTypeOnly ||
      (node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings) &&
        node.importClause.namedBindings.elements.length>0 &&
        node.importClause.namedBindings.elements.every(el=>el.isTypeOnly))),
    names:node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
        ? node.importClause.namedBindings.elements.map(el=>el.name.text)
        : ([] as string[]),
  }));
}
function resolveLocal(from:string,spec:string,sources:Sources):string {
  const path=posix.normalize(posix.join(posix.dirname(from),spec));
  const candidate=[
    path,
    ...(path.endsWith(".js") ? [path.slice(0,-3)+".ts",path.slice(0,-3)+".tsx"] : []),
    path+".ts",path+".tsx",posix.join(path,"index.ts"),
  ];
  return candidate.find(p=>Object.prototype.hasOwnProperty.call(sources,p))??path;
}
/** Exact erased TR013 wire imports only; no runtime packages/types permission. */
const tr013WireTypes:Readonly<Record<string,string>>={
  "modules/trainer-steps/application/read-visible-steps.ts":"TrainerVisibleStepItem",
  "modules/trainer-templates/application/read-public-templates.ts":
    "TrainerPublicStepTemplateItem",
  "modules/trainer-days/application/read-visible-days.ts":"TrainerVisibleDayItem",
};
const tr012EditorApp="modules/trainer-courses/application/read-course-editor.ts";
const tr012EditorWireTypes=[
  "TrainerCourseDraftItem", "TrainerCourseEditorSnapshotItem",
] as const;
const tr014DailyApp="modules/trainer-daily/application/read-trainer-daily.ts";
const tr014DailyWireTypes=[
  "TrainerDailyBundleItem", "TrainerDailyBundleStepCandidateItem",
  "TrainerDailyScheduleItem", "TrainerDailyCandidateItem",
] as const;
const tr013WireFile="../../../packages/types/src/data/trainer-read-contracts.ts";
function isAllowedTr013WireTypeImport(from:string, node:ts.ImportDeclaration,
  sources:Sources):boolean {
  const expected=tr013WireTypes[from];
  const isDaily=from===tr014DailyApp;
  const isEditor=from===tr012EditorApp;
  const clause=node.importClause;
  if((!expected && !isDaily && !isEditor) || !clause || clause.name ||
     !clause.namedBindings || !ts.isNamedImports(clause.namedBindings))return false;
  const bindings=clause.namedBindings.elements;
  if(bindings.length===0 || bindings.some(el=>el.propertyName) ||
     !(clause.isTypeOnly || bindings.every(el=>el.isTypeOnly)))return false;
  const names=bindings.map(el=>el.name.text);
  if(isDaily || isEditor){
    const allowed=isDaily?tr014DailyWireTypes:tr012EditorWireTypes;
    if(new Set(names).size!==names.length ||
       names.some(name=>!allowed.some(item=>item===name)))return false;
  }else if(bindings.length!==1 || names[0]!==expected)return false;
  if(!ts.isStringLiteral(node.moduleSpecifier))return false;
  const spec=node.moduleSpecifier.text;
  if(!spec.startsWith("."))return false;
  // Resolve from the checked source, not by substring/prefix in import text.
  const target=resolveLocal(from,spec,sources);
  return (target.endsWith(".ts")?target:target+".ts")===tr013WireFile;
}

const hasRouteImport=(file:ts.SourceFile, source:string, name:string,
  sources:Sources, importer:string)=>{
  return importsIn(file).some(item=>item.runtime &&
    item.specifier.startsWith(".") &&
    resolveLocal(importer,item.specifier,sources)===source &&
    item.names.includes(name));
};
function exportedBindings(file:ts.SourceFile) {
  const exports=new Map<string,ts.Expression>();
  for(const statement of file.statements) {
    if(!ts.isVariableStatement(statement)) continue;
    if(!statement.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword))continue;
    for(const decl of statement.declarationList.declarations) {
      if(ts.isIdentifier(decl.name) && decl.initializer)
        exports.set(decl.name.text,decl.initializer);
    }
  }
  return exports;
}
function objectBinding(node:ts.Expression,key:string,allowStrictStudentNotes=false):string|null {
  if(!ts.isObjectLiteralExpression(node)) return null;
  for(const prop of node.properties) {
    if(ts.isShorthandPropertyAssignment(prop) && prop.name.text===key)
      return prop.name.text;
    if(ts.isPropertyAssignment(prop) &&
       (ts.isIdentifier(prop.name)||ts.isStringLiteral(prop.name)) &&
       prop.name.text===key && ts.isIdentifier(prop.initializer)) {
      return prop.initializer.text;
    }
    // Read composition uses deferred typed forwarding: partial route Core mocks
    // need only provide the getter invoked by that request. Ensure it forwards
    // exactly the original arguments and directly calls the declared Core port.
    if(ts.isPropertyAssignment(prop) &&
       (ts.isIdentifier(prop.name)||ts.isStringLiteral(prop.name)) &&
       prop.name.text===key && ts.isArrowFunction(prop.initializer)) {
      const arrow=prop.initializer;
      if(!allowStrictStudentNotes &&
         ts.isCallExpression(arrow.body) && ts.isIdentifier(arrow.body.expression) &&
         arrow.parameters.every(p=>ts.isIdentifier(p.name)) &&
         arrow.body.arguments.length===arrow.parameters.length &&
         arrow.body.arguments.every((arg,i)=>ts.isIdentifier(arg) &&
           arg.text===(arrow.parameters[i].name as ts.Identifier).text)) {
        return arrow.body.expression.text;
      }
      // Exact AG1 StudentNotes API failure-mode flag. Every other composition
      // must continue forwarding only the declared arguments with no additions.
      if(allowStrictStudentNotes && key==="readNotes" &&
         ts.isCallExpression(arrow.body) && ts.isIdentifier(arrow.body.expression) &&
         arrow.body.expression.text==="getStudentNotes" &&
         arrow.parameters.length===1 && ts.isIdentifier(arrow.parameters[0].name) &&
         arrow.body.arguments.length===2 &&
         ts.isIdentifier(arrow.body.arguments[0]) &&
         arrow.body.arguments[0].text===arrow.parameters[0].name.text &&
         ts.isObjectLiteralExpression(arrow.body.arguments[1]) &&
         arrow.body.arguments[1].properties.length===1) {
        const prop=arrow.body.arguments[1].properties[0];
        if(ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) &&
           prop.name.text==="throwOnError" && prop.initializer.kind===ts.SyntaxKind.TrueKeyword)
          return "getStudentNotes";
      }
    }
  }
  return null;
}

/** Pure in-memory checker: negative fixtures never touch disk or load modules. */
function assess(sources:Sources,wiring:readonly Wiring[]):string[] {
  const errors:string[]=[];
  const parsed=new Map(Object.entries(sources).map(([path,text])=>[
    path,ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),
  ]));
  const deps=new Map<string,string[]>();
  for(const [path,file] of parsed) {
    if(!applicationSource(path))continue;
    deps.set(path,[]);
    for(const imported of importsIn(file)) {
      const spec=imported.specifier;
      if(!imported.runtime && spec.startsWith("@gafus/core/"))continue;
      if(isAllowedTr013WireTypeImport(path,imported.declaration,sources))continue;
      if(spec.startsWith(".")){
        const dest=resolveLocal(path,spec,sources);
        if(!applicationSource(dest)){
          errors.push(path+": application dependency escapes port layer: "+spec);
        } else if(imported.runtime){
          deps.get(path)!.push(dest);
        }
      } else {
        errors.push(path+": forbidden application runtime/external dependency: "+spec);
      }
    }
    for(const statement of file.statements) {
      if(ts.isExportDeclaration(statement) && statement.moduleSpecifier)
        errors.push(path+": re-export module bypasses application dependency gate");
      if(ts.isImportEqualsDeclaration(statement))
        errors.push(path+": import-equals dependency not permitted in application");
      if(ts.isExportAssignment(statement) && isCallOrNew(statement.expression))
        errors.push(path+": top-level export initialization in application");
      if(ts.isVariableStatement(statement)){
        for(const decl of statement.declarationList.declarations){
          if(decl.initializer && isCallOrNew(decl.initializer))
            errors.push(path+": top-level initializer in application");
        }
      } else if(ts.isExpressionStatement(statement)){
        errors.push(path+": top-level side effect in application");
      }
      const walk=(node:ts.Node):void=>{
        if(isForbiddenGlobalCall(node))
          errors.push(path+": transport/global call in application");
        if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)
          errors.push(path+": dynamic import in application");
        if(ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
          ["Redis","PrismaClient","Hono","WebSocket","Queue"].includes(node.expression.text))
          errors.push(path+": direct infrastructure constructor in application");
        ts.forEachChild(node,walk);
      };
      walk(statement);
    }
  }
  const visiting=new Set<string>(),done=new Set<string>();
  const dfs=(file:string):void=>{
    if(visiting.has(file)){
      errors.push("application cycle detected at "+file);return;
    }
    if(done.has(file))return;
    visiting.add(file);
    for(const next of deps.get(file)??[])dfs(next);
    visiting.delete(file);done.add(file);
  };
  for(const file of deps.keys())dfs(file);

  for(const entry of wiring){
    const root=parsed.get(entry.module), route=parsed.get(entry.route);
    const port=parsed.get(entry.application);
    if(!root || !route || !port){
      errors.push("missing actual composition/route/port for "+entry.exportName);
      continue;
    }
    const sourceImports=importsIn(root);
    if(!sourceImports.some(i=>i.runtime && i.specifier.startsWith(".") &&
      resolveLocal(entry.module,i.specifier,sources)===entry.application &&
      i.names.includes(entry.factory))){
      errors.push("composition missing application factory "+entry.factory);
    }
    const binding=exportedBindings(root).get(entry.exportName);
    if(!binding || !ts.isCallExpression(binding) ||
      !ts.isIdentifier(binding.expression) ||
      binding.expression.text!==entry.factory || !binding.arguments[0]){
      errors.push("composition wrong factory "+entry.exportName);
    } else {
      for(const [portName,coreName] of Object.entries(entry.ports)){
        const strictNotesPort=entry.exportName==="readStudentNotesApplication" &&
          portName==="readNotes" && coreName==="getStudentNotes";
        if(objectBinding(binding.arguments[0],portName,strictNotesPort)!==coreName)
          errors.push("composition wrong Core binding "+entry.exportName+"."+portName);
        if(entry.repository){
          if(!hasRouteImport(root,entry.repository,coreName,sources,entry.module))
            errors.push("composition missing approved repository "+coreName);
        } else if(!sourceImports.some(i=>i.runtime &&
           (entry.runtimeServiceModule
             ? i.specifier===entry.runtimeServiceModule
             : i.specifier.startsWith("@gafus/core/services/")) &&
           i.names.includes(coreName))) {
          errors.push("composition missing runtime Core service "+coreName);
        }
      }
    }
    if(entry.repository){
      const repository=parsed.get(entry.repository);
      const infraImports=repository ? importsIn(repository) : [];
      if(!repository || infraImports.length!==1 ||
         infraImports[0]?.specifier!=="@gafus/prisma" ||
         !infraImports[0]?.runtime || !infraImports[0]?.names.includes("prisma"))
        errors.push("repository must exclusively import Prisma "+entry.repository);
      if(importsIn(root).some(i=>i.specifier==="@gafus/prisma"))
        errors.push("composition cannot import Prisma "+entry.module);
      if(importsIn(route).some(i=>i.specifier==="@gafus/prisma"))
        errors.push("registered Hono route cannot import Prisma "+entry.route);
    }
    if(!hasRouteImport(route,entry.module,entry.exportName,sources,entry.route))
      errors.push("route not wired through composition "+entry.exportName);
    if(importsIn(route).some(i=>i.runtime && i.specifier.startsWith(".") &&
      resolveLocal(entry.route,i.specifier,sources)===entry.application))
      errors.push("route bypasses composition "+entry.exportName);
  }
  // Approved compositions may bind only their declared Core services.
  // Do not generalize this to legacy Hono handlers with unrelated Core imports.
  for(const composition of new Set(wiring.map(w=>w.module))) {
    const root=parsed.get(composition);
    if(!root)continue;
    const allowed=new Set(wiring.filter(w=>w.module===composition)
      .flatMap(w=>Object.values(w.ports)));
    const coreImports=importsIn(root)
      .filter(i=>i.runtime && i.specifier.startsWith("@gafus/core/services/"))
      .flatMap(i=>i.names);
    for(const name of coreImports) {
      if(!allowed.has(name))
        errors.push("unapproved Core business import in composition "+name);
      if(coreImports.filter(value=>value===name).length!==1)
        errors.push("duplicated Core business import in composition "+name);
    }
  }
  return errors;
}

function actualSources():Sources {
  const srcRoot=fileURLToPath(new URL("../../",import.meta.url));
  const absoluteRoot=realpathSync(srcRoot);
  const files=new Set<string>(WIRINGS.flatMap(w=>[
    w.module,w.route,w.application,...(w.repository ? [w.repository] : []),
  ]));
  for(const name of readdirSync(join(srcRoot,"modules"),{withFileTypes:true})){
    if(!name.isDirectory() || name.isSymbolicLink())continue;
    const appDir=join(srcRoot,"modules",name.name,"application");
    if(!lstatExists(appDir))continue;
    if(lstatSync(appDir).isSymbolicLink())throw new Error("SYMLINK:"+appDir);
    for(const entry of readdirSync(appDir,{withFileTypes:true})){
      if(entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")){
        if(entry.isSymbolicLink())throw new Error("SYMLINK:"+entry.name);
        files.add("modules/"+name.name+"/application/"+entry.name);
      }
    }
  }
  const result:Sources={};
  for(const file of files){
    const absolute=resolve(srcRoot,file);
    if(lstatSync(absolute).isSymbolicLink())throw new Error("SYMLINK:"+absolute);
    const actual=realpathSync(absolute);
    if(actual!==absoluteRoot && !actual.startsWith(absoluteRoot+sep))
      throw new Error("OUT_OF_REPO:"+relative(absoluteRoot,actual));
    result[file]=readFileSync(actual,"utf8");
  }
  return result;
}
function lstatExists(file:string):boolean {
  try {lstatSync(file);return true;}catch(e){
    if((e as NodeJS.ErrnoException).code==="ENOENT")return false;
    throw e;
  }
}
const APP_A="modules/a/application/a.ts";
const APP_B="modules/b/application/b.ts";
const simpleApp="export function createApp(){return {execute(){return 1;}};}";

describe("AG1-001 actual API application/composition architecture gate",()=>{
  it("real thirty-two-application and thirty-one-composition + nineteen-route module graph PASS",()=>{
    const sources=actualSources();
    expect(Object.keys(sources).filter(applicationSource).sort()).toEqual([
      "modules/achievements/application/read-achievements.ts",
      "modules/consultations/application/list-cynologists.ts",
      "modules/courses/application/read-access.ts",
      "modules/courses/application/read-courses.ts",
      "modules/courses/application/write-favorite.ts",
      "modules/courses/application/write-personalization.ts",
      "modules/courses/application/write-reviews.ts",
      "modules/exam/application/read-result.ts",
      "modules/exam/application/write-submit.ts",
      "modules/learner-daily/application/day-and-step-commands.ts",
      "modules/learner-daily/application/read-today-daily-course.ts",
      "modules/pet-prevention/application/journal.ts",
      "modules/pets/application/read-pets.ts",
      "modules/student-notes/application/read-student-notes.ts",
      "modules/surveys/application/read-surveys.ts",
      "modules/surveys/application/write-response.ts",
      "modules/trainer-articles/application/read-own-article-metadata.ts",
      "modules/trainer-courses/application/read-course-editor.ts",
      "modules/trainer-daily/application/read-trainer-daily.ts",
      "modules/trainer-days/application/read-visible-days.ts",
      "modules/trainer-exam/application/read-trainer-exam-metadata.ts",
      "modules/trainer-notes/application/read-notes-summary.ts",
      "modules/trainer-statistics/application/read-trainer-statistics.ts",
      "modules/trainer-steps/application/read-visible-steps.ts",
      "modules/trainer-templates/application/read-public-templates.ts",
      "modules/training/application/read-diary.ts",
      "modules/training/application/read-training-day.ts",
      "modules/training/application/read-training-days.ts",
      "modules/training/application/write-diary.ts",
      "modules/training/application/write-step-progress.ts",
      "modules/user/application/onboarding-tour.ts",
      "modules/user/application/read-profile.ts",
      "modules/user/application/read-public-profile.ts",
      "modules/user/application/update-profile.ts",
    ]);
    expect(Object.keys(sources)).toHaveLength(89);
    expect(assess(sources,WIRINGS)).toEqual([]);
  });
  it("rejects non-Core exam READ substitution in the sole exam result composition",()=>{
    const sources=actualSources();
    const owner="modules/exam/composition/read-result.ts";
    const original=sources[owner];
    expect(original).toContain("getExamResult(actorUserId, userStepId)");
    sources[owner]=original.replace(
      "getExamResult(actorUserId, userStepId)",
      "submitExamResult(actorUserId, userStepId)",
    );
    expect(assess(sources,WIRINGS)).toContain(
      "composition wrong Core binding readExamResultApplication.readResult");
  });
  it("rejects exam result route lacking its exact application composition import",()=>{
    const sources=actualSources();
    const owner="routes/v1/exam.ts";
    const original=sources[owner];
    const contract='import { readExamResultApplication } from "../../modules/exam/composition/read-result.js";';
    expect(original).toContain(contract);
    sources[owner]=original.replace(contract,"");
    expect(assess(sources,WIRINGS)).toContain(
      "route not wired through composition readExamResultApplication");
  });
  it("rejects exam POST submit composition bound to a different Core method",()=>{
    const sources=actualSources();
    const key="modules/exam/composition/write-submit.ts";
    const current=sources[key];
    expect(current).toContain("submitExamResult(actorUserId, data)");
    sources[key]=current.replace(
      "submitExamResult(actorUserId, data)",
      "getExamResult(actorUserId, data)",
    );
    expect(assess(sources,WIRINGS)).toContain(
      "composition wrong Core binding writeExamSubmitApplication.submit");
  });
  it("rejects exam POST submit route lacking exact composition binding",()=>{
    const sources=actualSources();
    const key="routes/v1/exam.ts";
    const current=sources[key];
    const statement='import { writeExamSubmitApplication } from "../../modules/exam/composition/write-submit.js";';
    expect(current).toContain(statement);
    sources[key]=current.replace(statement,"");
    expect(assess(sources,WIRINGS)).toContain(
      "route not wired through composition writeExamSubmitApplication");
  });
  it("rejects disabling the exact StudentNotes fail-closed API mode",()=>{
    const sources=actualSources();
    const key="modules/student-notes/composition/read-student-notes.ts";
    const current=sources[key];
    expect(current).toContain("throwOnError: true");
    sources[key]=current.replace("throwOnError: true","throwOnError: false");
    expect(assess(sources,WIRINGS)).toContain(
      "composition wrong Core binding readStudentNotesApplication.readNotes");
  });
  it("rejects omission of strict StudentNotes mode despite ordinary one-argument Core forward",()=>{
    const sources=actualSources();
    const key="modules/student-notes/composition/read-student-notes.ts";
    const current=sources[key];
    const strict="getStudentNotes(studentId, { throwOnError: true })";
    expect(current).toContain(strict);
    sources[key]=current.replace(strict,"getStudentNotes(studentId)");
    expect(assess(sources,WIRINGS)).toContain(
      "composition wrong Core binding readStudentNotesApplication.readNotes");
  });
  it.each([
    ["Prisma", 'import {prisma} from "@gafus/prisma";'],
    ["Hono", 'import {Hono} from "hono";'],
    ["transport", 'import {Queue} from "@gafus/queues";'],
    ["runtime Core", 'import {getUserProfileForApi} from "@gafus/core/services/user";'],
    ["side effect init", "export const connection = connect();"],
    ["transport fetch", 'export async function f(){return fetch("https://invalid.example");}'],
    ["direct constructor", "export function f(){return new PrismaClient();}"],
    ["dynamic import", 'export function f(){return import("@gafus/prisma");}'],
  ])("rejects %s from port-only application (negative in-memory)",(_,code)=>{
    expect(assess({[APP_A]:simpleApp+"\n"+code},[]).length).toBeGreaterThan(0);
  });
  it("accepts type-only Core signatures without runtime Core initialization",()=>{
    expect(assess({
      [APP_A]:'import type { getUserProfileForApi } from "@gafus/core/services/user";\n'
        +"export type Reader = typeof getUserProfileForApi;\n"+simpleApp,
    },[])).toEqual([]);
  });
  const stepsApp="modules/trainer-steps/application/read-visible-steps.ts";
  const templatesApp="modules/trainer-templates/application/read-public-templates.ts";
  const sharedWire="../../../../../../packages/types/src/data/trainer-read-contracts";
  it.each([
    ["steps import type",stepsApp,"TrainerVisibleStepItem",false],
    ["steps named type binding",stepsApp,"TrainerVisibleStepItem",true],
    ["templates import type",templatesApp,"TrainerPublicStepTemplateItem",false],
    ["days import type","modules/trainer-days/application/read-visible-days.ts",
      "TrainerVisibleDayItem",false],
  ] as const)("accepts %s only as exact erased shared wire dependency",(
    _,from,name,namedType,
  )=>{
    const code=namedType
      ? `import { type ${name} } from "${sharedWire}";`
      : `import type { ${name} } from "${sharedWire}";`;
    expect(assess({[from]:code+"\n"+simpleApp},[])).toEqual([]);
  });
  it.each([
    ["runtime",`import { TrainerVisibleStepItem } from "${sharedWire}";`,
      "application dependency escapes port layer"],
    ["mixed",`import { type TrainerVisibleStepItem, runtime } from "${sharedWire}";`,
      "application dependency escapes port layer"],
    ["side-effect",`import "${sharedWire}";`,
      "application dependency escapes port layer"],
    ["default",`import type Wire from "${sharedWire}";`,
      "application dependency escapes port layer"],
    ["namespace",`import type * as Wire from "${sharedWire}";`,
      "application dependency escapes port layer"],
    ["wrong named type",`import type { TrainerPublicStepTemplateItem } from "${sharedWire}";`,
      "application dependency escapes port layer"],
    ["renamed type",`import type { TrainerVisibleStepItem as Item } from "${sharedWire}";`,
      "application dependency escapes port layer"],
    ["reexport",`export type { TrainerVisibleStepItem } from "${sharedWire}";`,
      "re-export module bypasses"],
    ["import equals",`import Wire = require("${sharedWire}");`,
      "import-equals dependency not permitted"],
    ["dynamic",`export async function load(){return import("${sharedWire}");}`,
      "dynamic import in application"],
  ] as const)("rejects %s use of shared wire source",(_,code,reason)=>{
    const errors=assess({[stepsApp]:simpleApp+"\n"+code},[]);
    expect(errors.some(e=>e.includes(reason))).toBe(true);
  });
  it.each([
    ["different application owner",APP_A,sharedWire],
    ["foreign relative type source",stepsApp,
      "../../../../../../packages/types/src/data/not-trainer-read-contracts"],
    ["similar filename",stepsApp,
      "../../../../../../packages/types/src/data/trainer-read-contracts-extra"],
    ["similar prefix package",stepsApp,
      "../../../../../../packages/other/src/data/trainer-read-contracts"],
  ] as const)("rejects %s even for import type",(_,from,spec)=>{
    const code=`import type { TrainerVisibleStepItem } from "${spec}";`;
    const errors=assess({[from]:code+"\n"+simpleApp},[]);
    expect(errors.some(e=>e.includes("application dependency escapes port layer")))
      .toBe(true);
  });
  const daysApp="modules/trainer-days/application/read-visible-days.ts";
  it.each([
    ["runtime",`import { TrainerVisibleDayItem } from "${sharedWire}";`],
    ["mixed",`import { type TrainerVisibleDayItem, live } from "${sharedWire}";`],
    ["wrong type",`import type { TrainerVisibleStepItem } from "${sharedWire}";`],
    ["default",`import type Day from "${sharedWire}";`],
    ["foreign source",`import type { TrainerVisibleDayItem } from
      "../../../../../../packages/types/src/data/not-trainer-read-contracts";`],
  ] as const)("rejects Trainer Days %s noncanonical shared dependency",(_,code)=>{
    const errors=assess({[daysApp]:code+"\n"+simpleApp},[]);
    expect(errors.some(e=>e.includes("application dependency escapes port layer")))
      .toBe(true);
  });
  it("rejects non-Days application owner importing TrainerVisibleDayItem",()=>{
    const code=`import type { TrainerVisibleDayItem } from "${sharedWire}";`;
    const errors=assess({[APP_A]:code+"\n"+simpleApp},[]);
    expect(errors.some(e=>e.includes("application dependency escapes port layer")))
      .toBe(true);
  });
  const dailyApp="modules/trainer-daily/application/read-trainer-daily.ts";
  it.each([
    ["four exact item names",`import type { TrainerDailyBundleItem,
      TrainerDailyBundleStepCandidateItem, TrainerDailyScheduleItem,
      TrainerDailyCandidateItem } from "${sharedWire}";`],
    ["single erased item",`import { type TrainerDailyCandidateItem }
      from "${sharedWire}";`],
  ] as const)("accepts TR014 %s erased import only",(_,code)=>{
    expect(assess({[dailyApp]:code+"\n"+simpleApp},[])).toEqual([]);
  });
  it.each([
    ["runtime",`import { TrainerDailyCandidateItem } from "${sharedWire}";`],
    ["mixed",`import { type TrainerDailyCandidateItem, live } from "${sharedWire}";`],
    ["wrong type",`import type { TrainerVisibleDayItem } from "${sharedWire}";`],
    ["aliased",`import type { TrainerDailyCandidateItem as C } from "${sharedWire}";`],
    ["default",`import type Candidate from "${sharedWire}";`],
    ["foreign source",`import type { TrainerDailyCandidateItem } from
      "../../../../../../packages/types/src/data/trainer-read-contracts-extra";`],
    ["duplicate item",`import type { TrainerDailyCandidateItem,
      TrainerDailyCandidateItem } from "${sharedWire}";`],
    ["re-export",`export type { TrainerDailyCandidateItem } from "${sharedWire}";`],
    ["dynamic",`export async function f(){return import("${sharedWire}");}`],
    ["import-equals",`import C = require("${sharedWire}");`],
  ] as const)("rejects TR014 %s import escape",(_,code)=>{
    expect(assess({[dailyApp]:code+"\n"+simpleApp},[]).length).toBeGreaterThan(0);
  });
  it("rejects TR014 exact type from any other application",()=>{
    const code=`import type { TrainerDailyCandidateItem } from "${sharedWire}";`;
    expect(assess({[APP_A]:code+"\n"+simpleApp},[]).length).toBeGreaterThan(0);
  });
  const editorApp="modules/trainer-courses/application/read-course-editor.ts";
  it.each([
    ["draft and snapshot items",`import type { TrainerCourseDraftItem,
      TrainerCourseEditorSnapshotItem } from "${sharedWire}";`],
    ["single erased snapshot item",`import { type TrainerCourseEditorSnapshotItem }
      from "${sharedWire}";`],
  ] as const)("accepts TR012 %s only as erased exact wire import",(_,code)=>{
    expect(assess({[editorApp]:code+"\n"+simpleApp},[])).toEqual([]);
  });
  it.each([
    ["runtime",`import { TrainerCourseDraftItem } from "${sharedWire}";`],
    ["mixed",`import { type TrainerCourseDraftItem, live } from "${sharedWire}";`],
    ["foreign named type",`import type { TrainerDailyBundleItem } from "${sharedWire}";`],
    ["aliased",`import type { TrainerCourseDraftItem as Item } from "${sharedWire}";`],
    ["default",`import type Draft from "${sharedWire}";`],
    ["side effect",`import "${sharedWire}";`],
    ["foreign relative path",`import type { TrainerCourseDraftItem } from
      "../../../../../../packages/types/src/data/trainer-read-contracts-extra";`],
    ["re-export",`export type { TrainerCourseDraftItem } from "${sharedWire}";`],
    ["dynamic",`export function f(){return import("${sharedWire}");}`],
    ["import equals",`import Draft = require("${sharedWire}");`],
  ] as const)("rejects TR012 %s shared-wire bypass",(_,code)=>{
    expect(assess({[editorApp]:code+"\n"+simpleApp},[]).length).toBeGreaterThan(0);
  });
  it("rejects TR012 wire import from unrelated application",()=>{
    const code=`import type { TrainerCourseDraftItem } from "${sharedWire}";`;
    expect(assess({[APP_A]:code+"\n"+simpleApp},[]).length).toBeGreaterThan(0);
  });
  it("rejects cross-application runtime import cycle",()=>{
    const sources={
      [APP_A]:'import {b} from "../../b/application/b.js"; export const a=1;',
      [APP_B]:'import {a} from "../../a/application/a.js"; export const b=2;',
    };
    expect(assess(sources,[]).some(e=>e.includes("cycle detected"))).toBe(true);
  });
  it("rejects wrong actual composition binding, using in-memory altered graph",()=>{
    const s=actualSources();
    s["modules/user/composition/profile.ts"]=s["modules/user/composition/profile.ts"]
      .replace("loadProfile: getUserProfileForApi","loadProfile: updateUserProfile");
    expect(assess(s,WIRINGS).some(e=>e.includes("wrong Core binding"))).toBe(true);
  });
  it("rejects unrelated Core business import from a composition root",()=>{
    const s=actualSources();
    s["modules/user/composition/profile.ts"]=
      'import { deleteCourse } from "@gafus/core/services/trainerCourse";\n'
      +s["modules/user/composition/profile.ts"];
    expect(assess(s,WIRINGS).some(e=>e.includes("unapproved Core business import")))
      .toBe(true);
  });
  it("rejects re-exported runtime Prisma module from application",()=>{
    expect(assess({
      [APP_A]:simpleApp+'\nexport { prisma } from "@gafus/prisma";',
    },[]).some(e=>e.includes("re-export module bypasses"))).toBe(true);
  });
  it("rejects top-level default export with live initialization",()=>{
    expect(assess({
      [APP_A]:simpleApp+"\nexport default createDatabaseConnection();",
    },[]).some(e=>e.includes("top-level export initialization"))).toBe(true);
  });
  it("rejects targeted registered route bypassing composition",()=>{
    const s=actualSources();
    s["routes/v1/training.ts"]=s["routes/v1/training.ts"].replace(
      "../../modules/training/composition/read-training-day.js",
      "../../modules/training/application/read-training-day.js",
    );
    const errors=assess(s,WIRINGS);
    expect(errors.some(e=>e.includes("route not wired through composition"))).toBe(true);
    expect(errors.some(e=>e.includes("route bypasses composition"))).toBe(true);
  });
});
