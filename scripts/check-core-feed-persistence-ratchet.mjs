import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(project, "packages/core/src/services/feed");
const baselinePath = resolve(project, "docs/audit/feed-persistence-baseline-20261118.json");

const delegate = "(?:feed[A-Z][\\w$]*|gallery[A-Z][\\w$]*|user)";
const modelMethod =
  "(?:find(?:Unique|First|Many)(?:OrThrow)?|create(?:Many|ManyAndReturn)?|update(?:Many|ManyAndReturn)?|upsert|delete(?:Many)?|count|aggregate|groupBy)";
const rules = {
  FeedDb: /\bFeedDb\b/g,
  FeedTx: /\bFeedTx\b/g,
  delegates: new RegExp(
    `(?:\\.\\s*${delegate}|\\[\\s*["']${delegate}["']\\s*\\])\\s*(?:\\?\\.|\\.|\\[\\s*["'])\\s*${modelMethod}\\b`,
    "g",
  ),
  rawSQL: /\$(?:queryRaw|executeRaw)(?:Unsafe)?\b/g,
};
const ormDependency =
  /["'](?:@prisma\/[^"']+|@gafus\/(?:prisma(?:\/[^"']*)?|media-(?:shared|server)\/media-db-ports|feed-(?:server|storage)(?:\/[^"']*)?))["']|\bPrisma\s*\.|\$transaction\b|\b(?:PrismaClient|TransactionClient)\b/;
const isSource = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const isFixture = /\.(?:test|spec|integration|realpg|real-pg|acceptance)\./;

export function scanFeedPersistence(source) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, matcher]) => [name, [...source.matchAll(matcher)].length]),
  );
}

export function hasFeedOrmDependency(source) {
  return ormDependency.test(source);
}

function* productionFiles(directory, prefix = "") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) yield* productionFiles(join(directory, entry.name), name + "/");
    else if (entry.isFile() && isSource.test(name) && !isFixture.test(entry.name)) yield name;
  }
}

export function check(requireZero, scanRoot = root, initial = JSON.parse(readFileSync(baselinePath, "utf8"))) {
  const violations = [];
  const totals = Object.fromEntries(Object.keys(rules).map((name) => [name, 0]));
  const files = [...productionFiles(scanRoot)];
  for (const file of files) {
    const source = readFileSync(resolve(scanRoot, file), "utf8");
    if (requireZero && hasFeedOrmDependency(source)) violations.push(`${file}: ORM dependency`);
    for (const [name, count] of Object.entries(scanFeedPersistence(source))) {
      totals[name] += count;
      const allowed = requireZero ? 0 : (initial.files[file]?.[name] ?? 0);
      if (count > allowed) violations.push(`${file} ${name}: ${count} > ${allowed}`);
    }
  }
  if (violations.length)
    throw new Error(
      "FEED_CORE_PERSISTENCE_STILL_LEAKS " + JSON.stringify(totals) + "\n" + violations.join("\n"),
    );
  console.log(
    "FEED_PERSISTENCE_RATCHET_PASS " +
      JSON.stringify(totals) +
      " across " +
      files.length +
      " production modules",
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  check(process.argv.includes("--require-zero"));
}
