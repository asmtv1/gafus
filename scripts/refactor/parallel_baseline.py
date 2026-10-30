#!/usr/bin/env python3
"""G0 static source baseline for four-agent parallel work. No symlink following."""
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path("/Users/asmtv1/Desktop/gafus-refactor")
OUT = Path("docs/refactor/coordination/BASELINE.json")
SKIP = {".git", "node_modules", ".next", ".turbo", "dist", "build",
        "coverage", ".expo", ".prisma", "Pods", "artifacts", "android", "ios"}
EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
HTTP = ("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD")


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args], text=True).strip()


def guard():
    if Path.cwd() != ROOT or Path(os.path.realpath(ROOT)) != ROOT:
        raise RuntimeError("STOP: exact Refactor root required")
    if git("rev-parse", "--show-toplevel") != str(ROOT):
        raise RuntimeError("STOP: wrong Git root")
    if git("branch", "--show-current") != "vite":
        raise RuntimeError("STOP: unexpected Git branch")


def safe(rel):
    p = Path(rel)
    if p.is_absolute() or not p.parts or any(x in ("..", ".") for x in p.parts):
        raise RuntimeError("STOP: invalid relative path")
    current = ROOT
    for segment in p.parts:
        current = current / segment
        if current.is_symlink():
            raise RuntimeError("STOP: symlink encountered in " + str(rel))
    return current


def read(rel):
    p = safe(rel)
    if not p.is_file() or p.is_symlink():
        raise RuntimeError("STOP: missing or symlink file " + str(rel))
    return p.read_text(encoding="utf-8")


def walk(rel):
    base = safe(rel)
    found = []
    for directory, dirs, names in os.walk(base, followlinks=False):
        dirs[:] = sorted(x for x in dirs if x not in SKIP and
                         not (Path(directory) / x).is_symlink())
        for name in sorted(names):
            p = Path(directory) / name
            if p.suffix in EXT and p.is_file() and not p.is_symlink():
                found.append(p.relative_to(ROOT).as_posix())
    return sorted(found)


def next_url(file):
    parts = file.split("/src/app/", 1)[1].split("/")[:-1]
    return "/" + "/".join(p for p in parts if not
                          (p.startswith("(") and p.endswith(")")) and
                          not p.startswith("@"))


def next_methods(src):
    found = set(re.findall(
        r"export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b",
        src))
    for method in HTTP:
        if re.search(r"export\s*\{[^}]*\b" + method + r"\b[^}]*\}", src, re.S):
            found.add(method)
    return sorted(found)


def exports(src):
    return sorted(set(re.findall(
        r"export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)",
        src)))


def next_inventory(app):
    data = {"pages": [], "apiRoutes": [], "otherRoutes": [], "actions": []}
    for f in walk("apps/" + app + "/src"):
        s = read(f)
        if "/src/app/" in f and re.search(r"/page\.(?:ts|tsx|js|jsx)$", f):
            data["pages"].append({"url": next_url(f), "source": f})
        if "/src/app/" in f and re.search(r"/route\.(?:ts|tsx|js|jsx)$", f):
            row = {"url": next_url(f), "methods": next_methods(s), "source": f}
            key = "apiRoutes" if "/src/app/api/" in f else "otherRoutes"
            data[key].append(row)
        if re.search(r"""(?m)^\s*["']use server["']\s*;?""", s):
            data["actions"].append({"source": f, "exports": exports(s)})
    return data


def hono_inventory():
    app = read("apps/api/src/app.ts")
    imports = {}
    for m in re.finditer(
        r"""import\s*\{([^}]+)\}\s*from\s*["'](\./routes/[^"']+)["']""", app, re.S
    ):
        for item in m.group(1).split(","):
            name = item.strip().split(" as ")[0].strip()
            if name:
                imports[name] = "apps/api/src/" + m.group(2)[2:].removesuffix(".js") + ".ts"
    mounts = {}
    for m in re.finditer(r"""app\.route\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)""", app):
        if m.group(2) in imports:
            mounts.setdefault(imports[m.group(2)], []).append(m.group(1))
    pattern = re.compile(
        r"""(?<![\w.])(\w+)\.(get|post|put|patch|delete|options|head|all)\(\s*["']([^"']*)["']""",
        re.S)
    found = []
    for f in walk("apps/api/src/routes") + ["apps/api/src/app.ts"]:
        if ".test." in f or ".spec." in f or "/test/" in f:
            continue
        s = read(f)
        for m in pattern.finditer(s):
            prefixes = [""] if f == "apps/api/src/app.ts" else mounts.get(f, [None])
            for prefix in prefixes:
                url = m.group(3) if prefix is None else re.sub(
                    r"/+", "/", prefix.rstrip("/") + "/" + m.group(3).lstrip("/"))
                found.append({
                    "method": m.group(2).upper(), "path": url, "source": f,
                    "line": s.count("\n", 0, m.start()) + 1,
                    "mount": "UNRESOLVED" if prefix is None else "RESOLVED",
                    "dispatcher": m.group(2).lower() == "all" or "*" in url,
                })
    unique = {(r["method"], r["path"], r["source"], r["mount"]): r for r in found}
    return sorted(unique.values(), key=lambda x: (x["method"], x["path"], x["source"]))


def normalize(url):
    url = re.sub(r"\[\[\.\.\.[^]]+\]\]|\[\.\.\.[^]]+\]", "*", url)
    url = re.sub(r"\[([^]]+)\]", r":\1", url)
    return url.rstrip("/") or "/"


def match_next(routes, hono):
    exact = {(r["method"], normalize(r["path"])) for r in hono
             if r["mount"] == "RESOLVED" and r["method"] != "ALL"}
    dispatch = [r["path"][:-1] for r in hono
                if r["mount"] == "RESOLVED" and r["dispatcher"] and
                r["path"].endswith("*")]
    for r in routes:
        checks = []
        for method in r["methods"] or ["UNKNOWN"]:
            target = normalize(r["url"])
            if not target.startswith("/api/v1/"):
                status = "LEGACY_NON_V1"
            elif (method, target) in exact:
                status = "STATIC_PATH_ONLY"
            elif any(target.startswith(prefix) for prefix in dispatch):
                status = "DISPATCH_REVIEW"
            else:
                status = "NOT_MATCHED"
            checks.append({"method": method, "state": status})
        r["matches"] = checks


def mobile_inventory():
    screens = []
    for f in walk("apps/mobile/app"):
        if not f.endswith((".ts", ".tsx")):
            continue
        parts = f[len("apps/mobile/app/"):].rsplit(".", 1)[0].split("/")
        route = "/" + "/".join(x for x in parts if not
                               (x.startswith("(") and x.endswith(")")))
        screens.append({"source": f, "route": route})
    adapters = []
    for f in walk("apps/mobile/src/shared/lib/api"):
        if ".test." in f or ".spec." in f:
            continue
        s = read(f)
        refs = sorted(set(re.findall(r"/api/v1/[A-Za-z0-9_/:{}$.\-]+", s)))
        adapters.append({"source": f, "exports": exports(s),
                         "endpointReferences": [r[:160] for r in refs]})
    return {"screens": screens, "adapters": adapters}


def vite_inventory():
    src = read("apps/web-vite/src/shared/router/location.tsx")
    m = re.search(r"export const ROUTES\s*=\s*\[([\s\S]*?)\]\s*as const", src)
    routes = re.findall(r"""["'](/[^"']*)["']""", m.group(1)) if m else []
    helpers = re.findall(r"export function (\w+(?:Path|FromPath))\(", src)
    return {"staticRoutes": routes, "dynamicHelpers": helpers}


def create():
    d = {
        "schemaVersion": 1,
        "id": "G0-2026-10-16-vite-5fc78081",
        "status": "STATIC_SNAPSHOT_NOT_RUNTIME_CONTRACT",
        "root": str(ROOT), "branch": "vite",
        "head": git("rev-parse", "HEAD"),
        "gitStatusBeforeFreeze": git("status", "--short").splitlines(),
        "web": next_inventory("web"),
        "trainer": next_inventory("trainer-panel"),
        "admin": next_inventory("admin-panel"),
        "mobile": mobile_inventory(),
        "hono": hono_inventory(),
        "vite": vite_inventory(),
    }
    for app in ("web", "trainer", "admin"):
        match_next(d[app]["apiRoutes"], d["hono"])
    sources = {"apps/api/src/app.ts", "apps/api/src/middleware/auth.ts",
               "apps/api/src/middleware/cors.ts", "apps/api/src/lib/browser-auth.ts",
               "apps/web-vite/src/shared/router/location.tsx",
               "apps/mobile/src/shared/lib/api/client.ts", "pnpm-lock.yaml"}
    for app in ("web", "trainer", "admin"):
        for group in ("pages", "apiRoutes", "otherRoutes", "actions"):
            sources.update(r["source"] for r in d[app][group])
    sources.update(r["source"] for r in d["hono"])
    sources.update(r["source"] for r in d["mobile"]["screens"])
    sources.update(r["source"] for r in d["mobile"]["adapters"])
    sources.update(walk("packages/types/src"))
    d["hashes"] = {f: hashlib.sha256(read(f).encode()).hexdigest()
                   for f in sorted(sources)}
    d["counts"] = {
        "webPages": len(d["web"]["pages"]),
        "webApi": len(d["web"]["apiRoutes"]),
        "webActions": len(d["web"]["actions"]),
        "trainerPages": len(d["trainer"]["pages"]),
        "trainerApi": len(d["trainer"]["apiRoutes"]),
        "trainerOtherRoutes": len(d["trainer"]["otherRoutes"]),
        "trainerActions": len(d["trainer"]["actions"]),
        "adminPages": len(d["admin"]["pages"]),
        "adminApi": len(d["admin"]["apiRoutes"]),
        "adminActions": len(d["admin"]["actions"]),
        "mobileRouteFiles": len(d["mobile"]["screens"]),
        "mobileApiAdapters": len(d["mobile"]["adapters"]),
        "honoStaticDeclarations": len(d["hono"]),
        "viteStaticRoutes": len(d["vite"]["staticRoutes"]),
        "sourceFilesHashed": len(d["hashes"]),
    }
    raw = json.dumps(d, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    d["integrity"] = {"algorithm": "sha256",
                      "payloadHash": hashlib.sha256(raw.encode()).hexdigest()}
    p = safe(OUT)
    if p.exists() or p.is_symlink():
        raise RuntimeError("STOP: immutable baseline exists; never overwrite")
    with p.open("x", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("CREATED", OUT, json.dumps(d["counts"]))


def verify(compare=False):
    d = json.loads(read(OUT))
    integrity = d.pop("integrity")
    raw = json.dumps(d, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if hashlib.sha256(raw.encode()).hexdigest() != integrity["payloadHash"]:
        raise RuntimeError("Baseline checksum mismatch")
    if d["root"] != str(ROOT) or d["branch"] != "vite" or d["schemaVersion"] != 1:
        raise RuntimeError("Wrong baseline metadata")
    if compare:
        changed = []
        for f, expected in d["hashes"].items():
            try:
                actual = hashlib.sha256(read(f).encode()).hexdigest()
            except (OSError, RuntimeError):
                actual = "MISSING_OR_SYMLINK"
            if actual != expected:
                changed.append(f)
        print("SOURCE DRIFT", len(changed), "of", len(d["hashes"]))
        for f in changed[:80]:
            print("CHANGED", f)
        if changed:
            sys.exit(2)
    else:
        print("PASS immutable baseline integrity", d["id"],
              json.dumps(d["counts"]))


if __name__ == "__main__":
    guard()
    if sys.argv[1:] == ["--create"]:
        create()
    elif sys.argv[1:] == ["--verify"]:
        verify()
    elif sys.argv[1:] == ["--compare"]:
        verify(compare=True)
    else:
        raise SystemExit("Usage: parallel_baseline.py --create|--verify|--compare")
