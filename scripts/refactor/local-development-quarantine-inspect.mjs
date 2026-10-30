/** INFRA032: supplied PG archive METADATA ONLY. Never opens a DB or prints row data. */
import {
  readdirSync,
  lstatSync,
  openSync,
  readSync,
  closeSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const SOURCE = join(ROOT, "gafus dump");
const REQUIRED = ["User", "Course", "TrainingDay", "Step", "DayOnCourse", "StepOnDay"];
export function fail(code) {
  throw new Error(`INFRA032_${code}`); // Never echo raw filenames, TOC owners or secrets.
}
export function describeArchiveToc(text, prismaSchema) {
  if (typeof text !== "string" || typeof prismaSchema !== "string") fail("TOC_INPUT");
  const objects = new Map();
  const tableSchemas = new Map();
  const publicTables = new Set();
  const dataTables = new Set();
  for (const line of text.split("\n")) {
    const row = /^\d+;\s+\d+\s+\d+\s+(.+)$/.exec(line);
    if (!row) continue;
    const label = row[1];
    let kind = "OTHER";
    for (const name of [
      "TABLE DATA",
      "TABLE",
      "FK CONSTRAINT",
      "CONSTRAINT",
      "INDEX",
      "SEQUENCE SET",
      "SEQUENCE",
      "FUNCTION",
      "TRIGGER",
      "TYPE",
      "SCHEMA",
      "EXTENSION",
      "COMMENT",
      "ACL",
      "DEFAULT",
      "VIEW",
    ]) {
      if (label.startsWith(name + " ")) {
        kind = name;
        break;
      }
    }
    objects.set(kind, (objects.get(kind) ?? 0) + 1);
    if (kind === "TABLE" || kind === "TABLE DATA") {
      const parts = label.slice(kind.length + 1).split(" ");
      if (parts.length < 3) fail("TOC_RELATION_METADATA");
      if (kind === "TABLE") {
        tableSchemas.set(parts[0], (tableSchemas.get(parts[0]) ?? 0) + 1);
        if (parts[0] === "public") publicTables.add(parts[1]);
      } else if (parts[0] === "public") dataTables.add(parts[1]);
    }
  }
  const prismaModels = new Set(
    [...prismaSchema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((x) => x[1]),
  );
  const corePresent = REQUIRED.every((name) => publicTables.has(name) && dataTables.has(name));
  const layoutMatches =
    tableSchemas.size === 2 &&
    tableSchemas.get("public") === 166 &&
    tableSchemas.get("gafus_legacy_purchase_archive") === 7;
  return Object.freeze({
    objectCount: [...objects.values()].reduce((a, b) => a + b, 0),
    publicTables: publicTables.size,
    legacyPurchaseTables: tableSchemas.get("gafus_legacy_purchase_archive") ?? 0,
    publicDataItems: dataTables.size,
    prismaModels: prismaModels.size,
    prismaOnly: [...prismaModels].filter((name) => !publicTables.has(name)).length,
    archiveOnly: [...publicTables].filter((name) => !prismaModels.has(name)).length,
    corePresent,
    layoutMatches,
    externalSchemas: [...tableSchemas.keys()].filter(
      (s) => s !== "public" && s !== "gafus_legacy_purchase_archive",
    ).length,
  });
}
const REQUIRED_SCHEMA_COLUMNS = {
  User: [
    "id",
    "username",
    "password",
    "role",
    "createdAt",
    "updatedAt",
    "email",
    "phone",
    "telegramId",
  ],
  Course: [
    "id",
    "name",
    "type",
    "description",
    "equipment",
    "trainingLevel",
    "shortDesc",
    "duration",
    "logoImg",
    "isPrivate",
    "isPaid",
    "authorId",
    "videoUrl",
    "createdAt",
    "updatedAt",
    "showInProfile",
    "isPersonalized",
    "guideContent",
  ],
  TrainingDay: [
    "id",
    "title",
    "equipment",
    "description",
    "type",
    "authorId",
    "createdAt",
    "updatedAt",
    "showCoursePathExport",
    "shareProgressAcrossCourses",
  ],
  Step: [
    "id",
    "title",
    "description",
    "durationSec",
    "type",
    "imageUrls",
    "pdfUrls",
    "videoUrl",
    "checklist",
    "requiresVideoReport",
    "requiresWrittenFeedback",
    "hasTestQuestions",
    "surveySlug",
    "isDailyCourse",
    "authorId",
    "createdAt",
    "updatedAt",
    "estimatedDurationSec",
  ],
  DayOnCourse: ["id", "courseId", "dayId", "order"],
  StepOnDay: ["id", "dayId", "stepId", "order"],
};

/** Schema-only pg_restore text; inspect ONLY column names, never SQL defaults/rows. */
export function validateLearningTableColumns(schemaSql) {
  if (typeof schemaSql !== "string") fail("SCHEMA_ONLY_INPUT");
  for (const [table, needed] of Object.entries(REQUIRED_SCHEMA_COLUMNS)) {
    const pattern = new RegExp(String.raw`CREATE TABLE public\."?${table}"?\s*\((.*?)\n\);`, "s");
    const block = pattern.exec(schemaSql);
    if (!block) fail("LEARNING_TABLE_SCHEMA_MISSING");
    const found = new Set(
      [
        ...block[1].matchAll(
          /^\s*(?:"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))\s+[^\n,]+/gm,
        ),
      ].map((m) => m[1] || m[2]),
    );
    if (!needed.every((column) => found.has(column))) fail("LEARNING_COLUMN_SCHEMA_MISMATCH");
  }
  return true;
}

export function inspectSuppliedArchive() {
  if (realpathSync(process.cwd()) !== ROOT || lstatSync(SOURCE).isSymbolicLink())
    fail("ROOT_OR_PATH");
  const children = readdirSync(SOURCE, { withFileTypes: true });
  if (children.some((x) => x.isSymbolicLink() || !x.isFile())) fail("UNSAFE_DUMP_ENTRY");
  const archives = children.filter((x) => x.name.endsWith(".dump"));
  if (archives.length !== 1) fail("EXPECTED_SINGLE_CUSTOM_ARCHIVE");
  const file = join(SOURCE, archives[0].name);
  if (realpathSync(file) !== file) fail("ARCHIVE_SYMLINK_REFUSED");
  const fd = openSync(file, "r");
  const magic = Buffer.alloc(5);
  try {
    if (readSync(fd, magic, 0, 5, 0) !== 5 || magic.toString() !== "PGDMP")
      fail("NOT_CUSTOM_ARCHIVE");
  } finally {
    closeSync(fd);
  }
  // pg_restore --list reads ONLY the custom archive's TOC, never table data.
  let toc;
  try {
    toc = execFileSync("pg_restore", ["--list", file], {
      encoding: "utf8",
      timeout: 12000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    fail("PG_RESTORE_TOC_UNREADABLE");
  }
  const parsed = describeArchiveToc(
    toc,
    readFileSync(join(ROOT, "packages/prisma/schema.prisma"), "utf8"),
  );
  let schemaOnly;
  try {
    schemaOnly = execFileSync(
      "pg_restore",
      ["--schema-only", "--no-owner", "--no-acl", "--file=-", file],
      {
        encoding: "utf8",
        timeout: 12000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
  } catch {
    fail("SCHEMA_ONLY_UNREADABLE");
  }
  validateLearningTableColumns(schemaOnly);
  if (!parsed.corePresent || !parsed.layoutMatches || parsed.externalSchemas !== 0)
    fail("DUMP_SCHEMA_NOT_WHITELISTED");
  return parsed;
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== "--inspect") fail("INSPECT_ONLY_NO_RESTORE");
  const result = inspectSuppliedArchive();
  process.stdout.write(
    `INFRA032_PG_CUSTOM_TOC_ONLY_OK objects=${result.objectCount} public=${result.publicTables} legacy_purchase=${result.legacyPurchaseTables} prisma_only=${result.prismaOnly} rows=NOT_READ DB=NOT_CONTACTED restore=BLOCKED\n`,
  );
}
