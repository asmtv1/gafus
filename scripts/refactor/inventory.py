#!/usr/bin/env python3
"""MIG-INV-001: reproducible non-following static inventory."""
import argparse
import os
import re
from pathlib import Path

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
OUT = ROOT / 'docs/refactor/INVENTORY.md'
SKIP = {'.git', 'node_modules', '.next', '.turbo', 'dist', 'coverage', '.expo', '.prisma', 'Pods'}
EXT = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'}
HTTP = 'GET POST PUT PATCH DELETE OPTIONS HEAD'.split()
Q = chr(96)

def files(path):
    base = ROOT / path
    if base.is_symlink():
        raise RuntimeError('Symlink root refused')
    result = []
    for d, dirs, names in os.walk(base, followlinks=False):
        dirs[:] = sorted(x for x in dirs if x not in SKIP and not (Path(d) / x).is_symlink())
        for name in names:
            f = Path(d) / name
            if f.suffix in EXT and not f.is_symlink() and f.is_file():
                result.append(f)
    return sorted(result)

def source(f):
    if f.is_symlink() or not f.is_relative_to(ROOT):
        raise RuntimeError('Symlink / out-of-project source refused')
    return f.read_text(encoding='utf-8')

def rel(f):
    return f.relative_to(ROOT).as_posix()

def path_for(f):
    dirs = f.relative_to(ROOT / 'apps/web/src/app').parts[:-1]
    return '/' + '/'.join(p for p in dirs if not (p.startswith('(') and p.endswith(')')))

def next_methods(s):
    result = set(re.findall(r'export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b', s))
    for method in HTTP:
        if re.search(r'export\s*\{[^}]*\b' + method + r'\b[^}]*\}', s, re.S):
            result.add(method)
    return ', '.join(sorted(result)) or 'dynamic / inspect'

def web_inventory(web):
    pages, routes, actions = [], [], []
    for f in web:
        p = rel(f)
        if '/app/' in p and f.name in {'page.ts', 'page.tsx', 'page.js', 'page.jsx'}:
            pages.append((path_for(f), p))
        if '/app/api/' in p and f.name in {'route.ts', 'route.tsx', 'route.js', 'route.jsx'}:
            routes.append((path_for(f), next_methods(source(f)), p))
        if re.search(r'''(?m)^\s*["']use server["']\s*;?''', source(f)):
            actions.append(p)
    return sorted(pages), sorted(routes), sorted(actions)

def hono_inventory(api):
    app_file = ROOT / 'apps/api/src/app.ts'
    app_src = source(app_file)
    imports = {}
    for m in re.finditer(r'''import\s*\{([^}]+)\}\s*from\s*["'](\./routes/[^"']+)["']''', app_src, re.S):
        for item in m.group(1).split(','):
            name = item.strip().split(' as ')[0].strip()
            if name:
                imports[name] = (ROOT / 'apps/api/src' / m.group(2).removesuffix('.js')).with_suffix('.ts')
    mounts = {}
    for m in re.finditer(r'''app\.route\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)''', app_src):
        prefix, name = m.groups()
        if name in imports:
            mounts.setdefault(imports[name], []).append(prefix)
    pattern = re.compile(r'''(?<![\w.])(\w+)\.(get|post|put|patch|delete|options|head|all)\(\s*["']([^"']*)["']''', re.S)
    found = []
    for f in api:
        if '.test.' in f.name or '.spec.' in f.name or '/test/' in rel(f):
            continue
        if '/routes/' not in rel(f) and f != app_file:
            continue
        for m in pattern.finditer(source(f)):
            var, method, suffix = m.groups()
            if f == app_file:
                found.append((method.upper() + ' ' + suffix, rel(f), 'direct'))
            elif f in mounts:
                for prefix in mounts[f]:
                    url = (prefix.rstrip('/') + '/' + suffix.lstrip('/')).replace('//', '/')
                    found.append((method.upper() + ' ' + url, rel(f), 'mounted'))
            else:
                found.append((method.upper() + ' ' + suffix, rel(f), 'mount unresolved'))
    return sorted(set(found))

def pwa_inventory():
    pattern = re.compile(r'(?i)serviceworker|service.worker|workbox|next-pwa|manifest\.json|beforeinstallprompt|pushmanager|/sw\.js|offline|webpush|web-push|background.?sync')
    found = []
    for area in ['apps/web/src', 'apps/web/public', 'apps/web/scripts']:
        for f in files(area):
            if pattern.search(rel(f)) or pattern.search(source(f)):
                found.append(rel(f))
    for name in ['apps/web/next.config.ts', 'apps/web/package.json', 'apps/web/public/manifest.json']:
        f = ROOT / name
        if f.is_file() and not f.is_symlink():
            found.append(name)
    return sorted(set(found))

def code(p):
    return Q + p + Q

def prisma_link_status():
    """Read link metadata only: NEVER follow the target."""
    link = ROOT / 'apps/web/.prisma/client'
    if not link.is_symlink():
        return '- Prisma Web symlink отсутствует; проверить сборку отдельно.'
    target = link.readlink()
    if target.is_absolute():
        return '- Prisma Web symlink внешний: сборки требуют проверки изоляции.'
    import os
    normalized = Path(os.path.normpath(str(link.parent / target)))
    if normalized.is_relative_to(ROOT):
        return '- Prisma Web symlink является внутренней относительной ссылкой Refactor.'
    return '- Prisma Web symlink выходит за границы Refactor; сборки не запускать.'

def render():
    web = files('apps/web/src')
    api = files('apps/api/src')
    pages, routes, actions = web_inventory(web)
    hono = hono_inventory(api)
    pwa = pwa_inventory()
    lines = [
        '# MIG-INV-001 — Инвентаризация исходников GAFUS Refactor', '',
        'Инвентаризация Refactor. Генератор: scripts/refactor/inventory.py; обновлять через --refresh.',
        'Все обходы каталогов НЕ следуют символическим ссылкам.', '',
        '## Объём', '',
        '- Web: ' + str(len(web)) + ' JS/TS-файлов; ' + str(len(pages)) + ' Next page; ' + str(len(routes)) + ' Next API route; ' + str(len(actions)) + ' модулей use server.',
        '- API: ' + str(len(api)) + ' JS/TS-файлов; ' + str(len(hono)) + ' извлечённых деклараций Hono HTTP-методов (в том числе mounted).',
        '- PWA/offline/push: ' + str(len(pwa)) + ' файлов-кандидатов; необходима ручная классификация.',
        prisma_link_status(),
        '', '## Next.js Web pages', '', '| URL | Source |', '|---|---|',
    ]
    lines += ['| ' + code(path) + ' | ' + code(file) + ' |' for path, file in pages]
    lines += ['', '## Next.js Web API routes', '', '| URL | Methods (static) | Source |', '|---|---|---|']
    lines += ['| ' + code(path) + ' | ' + methods + ' | ' + code(file) + ' |' for path, methods, file in routes]
    lines += ['', '## Web use server modules', '']
    lines += ['- ' + code(file) for file in actions]
    lines += ['', '## Hono route declarations', '', '| Method + URL or local suffix | Source | Mount |', '|---|---|---|']
    lines += ['| ' + code(op) + ' | ' + code(file) + ' | ' + mount + ' |' for op, file, mount in hono]
    lines += ['', '## PWA, offline, web push candidates', '']
    lines += ['- ' + code(file) for file in pwa]
    lines += ['', '## Ограничения', '',
        '- Количество Hono-методов не равно количеству всех HTTP endpoint: wildcard handlers и dispatch в пакетах скрывают реализацию. Нужен контрактный runtime-аудит.',
        '- Тренерскую/административную панели и обработчики в пакетах необходимо отдельно сопоставить с единым API.',
        '- WEB PWA и Web Push должны быть полностью удалены, включая sw.js/manifest/регистрацию/Workbox/офлайн. Expo native push/offline остаются.',
        '- Утверждения Deep Research о текущих маршрутах необходимо сверять с кодом; Hono уже содержит реализацию auth.',
        '- Не запускались приложения и никакие сетевые запросы. Эндпоинты классифицированы статически.',
        ''
    ]
    return '\n'.join(lines)

def main():
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--refresh', action='store_true')
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--summary', action='store_true')
    args = ap.parse_args()
    if Path(os.path.abspath(__file__)) != ROOT / 'scripts/refactor/inventory.py':
        raise SystemExit('Wrong location')
    result = render()
    if args.write:
        if OUT.exists() or OUT.is_symlink():
            raise SystemExit('Refuse overwrite existing inventory')
        OUT.write_text(result, encoding='utf-8')
        print('CREATED', rel(OUT))
    elif args.refresh:
        if OUT.is_symlink() or not OUT.is_file():
            raise SystemExit('Refuse refresh absent/symlink inventory')
        previous = source(OUT)
        if not previous.startswith('# MIG-INV-001 — Инвентаризация исходников GAFUS Refactor'):
            raise SystemExit('Refuse overwrite a non-generated inventory')
        OUT.write_text(result, encoding='utf8')
        print('UPDATED', rel(OUT), 'old_lines=', len(previous.splitlines()),
              'new_lines=', len(result.splitlines()))
    elif args.check:
        if OUT.is_symlink() or not OUT.is_file() or source(OUT) != result:
            raise SystemExit('FAIL inventory differs from static scan')
        print('PASS: inventory is complete and current')
    else:
        print('\n'.join(result.splitlines()[:12]))

if __name__ == '__main__':
    main()
