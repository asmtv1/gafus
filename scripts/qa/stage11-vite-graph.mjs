// Build and inspect real production graphs, without touching deployed assets.
// Usage: node scripts/qa/stage11-vite-graph.mjs build WORKTREE NEW_OUTPUT_DIR
//        node scripts/qa/stage11-vite-graph.mjs inspect OUTPUT_DIR [--candidate]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve, relative } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";

const [command, arg, output] = process.argv.slice(2);
const configs = [
  ["web", "apps/web-vite", "vite.config.mjs"],
  ["admin", "apps/admin-panel", "vite.config.mjs"],
  ["trainer", "apps/trainer-panel", "src/trainer-vite/live/vite.config.mjs"],
];
if (command === "build") {
  const root = realpathSync(arg), out = resolve(output);
  assert.ok(!existsSync(out), "Output directory must be new");
  assert.ok(relative(root, out).startsWith("../"), "Use a disposable output outside worktree");
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const require = createRequire(resolve(root, "package.json"));
  const { build } = await import(pathToFileURL(require.resolve("vite")));
  process.env.GAFUS_PRIVATE_MAPS_ENABLED = "false";
  for (const [name, rel, config] of configs) {
    process.chdir(resolve(root, rel));
    const target = resolve(out, name);
    const graph = {};
    await build({
      configFile: resolve(root, rel, config), mode: "production",
      build: { manifest: true, outDir: target, sourcemap: false, emptyOutDir: true },
      plugins: [{
        name: "stage11-inspect-build",
        generateBundle(_options, bundle) {
          for (const [file, chunk] of Object.entries(bundle)) if (chunk.type === "chunk") {
            graph[file] = {
              entry: chunk.isEntry, dynamicEntry: chunk.isDynamicEntry,
              facade: chunk.facadeModuleId?.replace(root, "ROOT"),
              imports: chunk.imports, dynamicImports: chunk.dynamicImports,
              modules: Object.keys(chunk.modules).map(m => m.replace(root, "ROOT")),
            };
          }
        },
      }],
    });
    writeFileSync(resolve(target, "graph.json"), JSON.stringify(graph, null, 2));
  }
} else if (command === "inspect") {
  const strict = output === "--candidate";
  const report = {};
  for (const [name] of configs) {
    const root = resolve(arg, name);
    const graph = JSON.parse(readFileSync(resolve(root, "graph.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(resolve(root, ".vite/manifest.json"), "utf8"));
    const find = suffix => Object.keys(graph).filter(f =>
      graph[f].modules.some(m => m.endsWith("/" + suffix)));
    function closure(files) {
      const seen = new Set();
      const queue = [...files];
      while (queue.length) {
        const file = queue.pop();
        if (seen.has(file)) continue;
        assert.ok(graph[file], "Missing graph file " + file);
        seen.add(file); queue.push(...graph[file].imports);
      }
      return seen;
    }
    const entry = closure(Object.keys(graph).filter(f => graph[f].entry));
    function metrics(files) {
      const css = new Set(Object.values(manifest).filter(v => files.has(v.file)).flatMap(v => v.css ?? []));
      const bytes = [...files, ...css].map(f => readFileSync(resolve(root, f)));
      return { jsFiles: files.size, cssFiles: css.size, bytes: bytes.reduce((s,b) => s+b.length,0),
        gzipBytes: bytes.reduce((s,b) => s+gzipSync(b,{level:9}).length,0) };
    }
    const modules = Object.values(graph).flatMap(v => v.modules);
    const route = suffix => {
      const owners = find(suffix);
      return owners.length ? metrics(new Set([...entry,...closure(owners)])) : undefined;
    };
    report[name] = { entry: metrics(entry), chat:route("Chat2Messenger.tsx"),
      mainPanel:route("mountInWeb.tsx"), gallery:route("GalleryAlbums.tsx"),
      publicGallery:route("PublicGalleryView.tsx"), users:route("UserManagement.tsx"),
      moderation:route("ModerationPanels.tsx"), analytics:route("AnalyticsPanels.tsx") };
    if (!strict) continue;
    if (name === "trainer") {
      assert.ok(!modules.some(m => /TrainerCourseFullFormSourceMock|\/(?:__fixtures__|__tests__)\//.test(m)));
    } else {
      assert.ok(!modules.some(m => /\/packages\/cdn-upload\/|\/@aws-sdk\//.test(m)));
    }
    if (name === "admin") {
      for (const suffix of ["UserManagement.tsx","ModerationPanels.tsx","AnalyticsPanels.tsx","SubscriptionPanels.tsx"]) {
        const owners = find(suffix);
        assert.ok(owners.length && owners.every(f=>!entry.has(f)), suffix+" eager in initial bundle");
      }
    }
    if (name === "web") {
      const viewer=find("GalleryViewerPhoto.tsx");
      assert.equal(viewer.length,1);
      assert.ok(graph[viewer[0]].dynamicEntry);
      for (const suffix of ["GalleryAlbums.tsx","PublicGalleryView.tsx"]) {
        const grid=new Set([...entry,...closure(find(suffix))]);
        assert.ok(!grid.has(viewer[0]), suffix+" eagerly includes full viewer");
        report[name][suffix+"Open"]=metrics(new Set([...grid,...closure(viewer)]));
      }
    }
  }
  console.log(JSON.stringify(report,null,2));
} else throw new Error("Expected build WORKTREE NEW_OUTPUT_DIR or inspect OUTPUT_DIR [--candidate]");
