#!/usr/bin/env python3
"""Generate source-backed references, excluding .env/secret values."""
import collections, json, re
from urllib.parse import quote
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DOC=ROOT/'docs/reference'
DOC.mkdir(parents=True,exist_ok=True)
B=chr(96)
def q(s):return B+str(s).replace(B,'')+B
def link(p):return '['+q(p.relative_to(ROOT)) +'](../../'+quote(p.relative_to(ROOT).as_posix(),safe='/')+')'
def write(name,title,ls):
 (DOC/name).write_text('# '+title+'\n\n> Сгенерировано 2026-10-29 из исходников. Обновить: '+q('python3 scripts/docs/generate_reference.py')+'. Инвентаризация не равна PASS тестов. Значения секретов не читаются.\n\n'+'\n'.join(ls).rstrip()+'\n',encoding='utf8')
def pj(p):
 try:return json.loads(p.read_text())
 except:return {}
# Workspaces
ls=['| Путь | Имя пакета | Скрипты |','|---|---|---|']
for base in ('apps','packages'):
 for f in sorted((ROOT/base).glob('*/package.json')):
  d=pj(f)
  ls.append('| '+link(f.parent)+' | '+q(d.get('name','?'))+' | '+', '.join(map(q,d.get('scripts',{})))+' |')
ls+=['','## Корневые команды','', '| Команда | Реализация |','|---|---|']
for k,v in pj(ROOT/'package.json').get('scripts',{}).items():ls.append('| '+q('pnpm '+k)+' | '+q(v)+' |')
write('WORKSPACES_AND_COMMANDS.md','Workspaces и команды',ls)
# Hono mounts
app_path=ROOT/'apps/api/src/app.ts';app=app_path.read_text()
imports={}
for m in re.finditer(r'import\s*\{([^}]+)\}\s*from\s*["\x27]([^"\x27]+)["\x27]',app,re.S):
 for name in m.group(1).split(','):
  name=name.strip().split(' as ')[-1].strip()
  if name:imports[name]=m.group(2)
routes=[]
for m in re.finditer(r'app\.route\(\s*["\x27]([^"\x27]+)["\x27]\s*,\s*(\w+)\s*\)',app):
 prefix,name=m.groups();mod=imports.get(name,'');f=(app_path.parent/mod.replace('.js','.ts')).resolve() if mod.startswith('.') else None
 routes.append((prefix,name,f if f and f.is_file() else None))
ls=['Монтирование роутеров из '+link(app_path)+'. Реальная авторизация зависит от порядка middleware.','',
'| Prefix | Router | Source |','|---|---|---|']
for prefix,name,f in routes:ls.append('| '+q(prefix)+' | '+q(name)+' | '+(link(f) if f else 'проверить import')+' |')
ls+=['','Всего монтирований: **'+str(len(routes))+'**.','','## Статически распознанные HTTP-методы','',
'Строковые пути в исходниках; динамические/nested пути могут отсутствовать. Проверяйте файлы и тесты.','','| Prefix | HTTP | Path | Module |','|---|---|---|---|']
pattern=re.compile(r'\.(get|post|put|patch|delete|options|all)\(\s*["\x27\x60]([^"\x27\x60]+)["\x27\x60]',re.I)
n=0
for prefix,name,f in routes:
 if f:
  seen=set()
  for method,path in pattern.findall(f.read_text(errors='replace')):
   if len(path)>150 or chr(10) in path or (method,path) in seen:continue
   seen.add((method,path));n+=1
   ls.append('| '+q(prefix)+' | '+q(method.upper())+' | '+q(path)+' | '+link(f)+' |')
ls+=['','Статически распознано HTTP-методов: **'+str(n)+'**. Подробности DTO, security, query/body: код и тесты.',
'','Закрытые job endpoints: '+q('/internal/*')+'. Не вызывать вне разрешённого локального окружения.']
write('API_ROUTERS.md','Hono API: префиксы и HTTP-методы',ls)
# Prisma
f=ROOT/'packages/prisma/schema.prisma';s=f.read_text()
blocks=list(re.finditer(r'(?ms)^(model|enum)\s+(\w+)\s*\{\n(.*?)^\}',s))
ls=['Источник: '+link(f)+' и каталог '+link(ROOT/'packages/prisma/migrations')+'.',
'','Количество моделей: **'+str(sum(m.group(1)=='model' for m in blocks))+'**, enum: **'+str(sum(m.group(1)=='enum' for m in blocks))+'**.','']
for m in blocks:
 kind,name,body=m.groups();fields=[]
 for line in body.splitlines():
  p=line.strip().split()
  if not p or p[0].startswith(('@','//')):continue
  fields.append(p[0]+(': '+p[1] if kind=='model' and len(p)>1 else ''))
 ls+=['### '+kind+' '+q(name),'', ', '.join(map(q,fields)) or '(нет полей)','']
ls+=['Проверка relations, default, indexes, onDelete и схем миграций только по оригинальному файлу. Любые production migrations требуют отдельного разрешения.']
write('PRISMA_MODELS.md','Prisma: полный список моделей, enum и полей',ls)
# Environment keys from source; never read env files
keys=collections.defaultdict(set)
skip={'node_modules','dist','build','.next','.turbo','Pods','.terraform','.git','.cache','output','artifacts'}
for base in ('apps','packages','infra','ci-cd','scripts','.github'):
 for f in (ROOT/base).rglob('*'):
  if not f.is_file() or f.suffix not in {'.ts','.tsx','.js','.mjs','.cjs','.sh','.yaml','.yml'}:continue
  if f.stat().st_size>350000 or f.name.startswith('.env'):continue
  parts=f.relative_to(ROOT).parts
  if any(p in skip or p.startswith('.ag') for p in parts):continue
  # Old API agent captures/temporary runners are not environment contract sources.
  # These paths are excluded from the release and must not repopulate ENV_NAMES.
  if len(parts)>2 and parts[:2]==('apps','api') and parts[2].startswith(
      ('g1','g2','w1','.g1','.g2','.chat2','.guest-')):continue
  try:source=f.read_text()
  except (OSError,UnicodeError):continue
  for a,b in re.findall(r'\bprocess\.env\.([A-Z][A-Z0-9_]*)\b|\b(?:getenv|env)\(\s*["\x27]([A-Z][A-Z0-9_]*)["\x27]',source):
   keys[a or b].add(f)
ls=['**Только имена**: значения .env, токены, креденшелы, key-файлы не прочитаны и не включены.',
'Упоминание переменной не означает обязательность для каждого сервиса.','','| Имя | Использование (до 3 источников) |','|---|---|']
for k,files in sorted(keys.items()):
 sf=sorted(files);ls.append('| '+q(k)+' | '+', '.join(link(f) for f in sf[:3])+(' (ещё '+str(len(sf)-3)+')' if len(sf)>3 else '')+' |')
ls+=['','Найдено уникальных имён: **'+str(len(keys))+'**.']
write('ENV_NAMES.md','Переменные окружения: безопасный индекс имён',ls)
# UI source tree
ls=['Наличие исходника не является доказательством PASS/паритета. Проверять по QA и live-прогону.','']
for base in ('apps/web-vite/src/features','apps/mobile/src','apps/trainer-panel/src','apps/admin-panel/src'):
 d=ROOT/base
 if not d.is_dir():continue
 ls+=['## '+q(base),'']
 for f in sorted(d.iterdir()):
  if f.is_dir() and not f.name.startswith('.'):ls.append('- '+link(f))
 ls.append('')
ls+=['Функциональная матрица: [FUNCTIONAL_MATRIX](../qa/FUNCTIONAL_MATRIX.md); [CURRENT_RELEASE_STATUS](../qa/CURRENT_RELEASE_STATUS.md); [NEXT_ACTIONS](../qa/NEXT_ACTIONS.md).']
write('FRONTEND_SOURCE_MAP.md','Исходники Web, Mobile, Trainer, Admin',ls)
# CI
ls=['## Github Actions','']
for f in sorted((ROOT/'.github/workflows').glob('*.yml')):ls.append('- '+link(f))
ls+=['','## Root scripts','']
for f in sorted((ROOT/'scripts').iterdir()):
 if f.is_file():ls.append('- '+link(f))
ls+=['','## Инфраструктурные разделы','']
for d in ('infra/cloudru','infra/feed','infra/gallery','infra/chat2','docker','ci-cd','scripts/qa','scripts/refactor'):
 f=ROOT/d
 if f.exists():ls.append('- '+link(f))
ls+=['','Production deploy, database migrations и production data writes не входят в инвентаризацию и локальные проверки.']
write('CI_SCRIPTS.md','CI/CD, Docker и скрипты',ls)

# UI route reference (source-derived; excludes test-only and deprecated pages)
web=ROOT/'apps/web-vite/src/App.tsx'
web_routes=sorted(set(re.findall(r'case\s+"(/[^"]*)"\s*:',web.read_text())))
ls=['## Web Vite: активный switch в App.tsx','',
    'Источник: '+link(web)+'. Динамические пути и клиентские aliases требуют изучения исходника/браузерной проверки.','']
ls+=['- '+q(x) for x in web_routes]
admin=ROOT/'apps/admin-panel/src/admin-live/routes.ts'
admin_routes=re.findall(r'path:\s*"(/main-panel[^"]*)"',admin.read_text())
ls+=['','## Admin Panel: конфигурация разделов','',
     'Источник: '+link(admin)+'. Реальные role-gates — API + route guards.','']
ls+=['- '+q(x) for x in admin_routes]
trainer=ROOT/'apps/trainer-panel/src/trainer-vite/live/LiveTrainerApp.tsx'
trainer_nav=re.findall(r'\["([^"]+)",\s*"(/main-panel[^"]*)"\]',trainer.read_text())
ls+=['','## Trainer Panel: навигация live-приложения','',
     'Источник: '+link(trainer)+'. Файл routes.ts содержит дополнительные preview/legacy patterns; он **не доказательство** активного live route.','',
     '| Название | URL |','|---|---|']
ls+=['| '+label+' | '+q(url)+' |' for label,url in trainer_nav]
mobile=ROOT/'apps/mobile/app'
ls+=['','## Expo Router: Mobile файловая маршрутизация','',
     'Источник: '+link(mobile)+'. Параметры вида [id] — динамические. Имена групп в скобках не являются частью URL.','']
mobile_files=[]
for f in sorted(mobile.rglob('*.tsx')):
 if f.name.startswith('_') or f.name.startswith('+'):continue
 route='/'+('/'.join(x for x in f.relative_to(mobile).with_suffix('').parts if not (x.startswith('(') and x.endswith(')'))))
 mobile_files.append((route,f))
for route,f in mobile_files:ls.append('- '+q(route)+' — '+link(f))
ls+=['','Проверку доступности, редиректов, прав и каждой кнопки проводить Playwright + native QA по полной матрице.']
write('UI_ROUTES.md','Реальные маршруты Web/Admin/Trainer/Mobile',ls)

print('Generated references: API mounts',len(routes),'HTTP routes',n,'Prisma blocks',len(blocks),'env names',len(keys))
