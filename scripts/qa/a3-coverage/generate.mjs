import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const output=path.dirname(fileURLToPath(import.meta.url));
const root=process.argv[2]||'/Users/asmtv1/Desktop/gafus-refactor';
const runner=fs.readFileSync(path.join(root,'scripts/qa/architecture-final-regression.sh'),'utf8');
const main=runner.match(/for pkg in (core api worker[^\n]*); do/);
const app=runner.match(/for pkg in mobile trainer-panel admin-panel; do/);
if(!main||!app||!runner.includes('run_gate web node scripts/qa/web-vite-chunked-regression.mjs'))throw Error('ARCHITECTURE_RUNNER_UNRECOGNIZED');
const mainPkgs=new Set(main[1].trim().split(/\s+/).map(x=>'@gafus/'+x));
const mainApps=new Set(['@gafus/mobile','@gafus/trainer-panel','@gafus/admin-panel']);
const consumer={
 '@gafus/bull-board':'Worker/Bull Board runtime and API health; no own unit test; release build/typecheck gate',
 '@gafus/admin-rewarded-ads-server':'Legacy admin rewarded-ads and API contracts; no own tests',
 '@gafus/cdn-upload':'CDN/MinIO/media isolated QA; direct Vitest sources exist but package test script is absent',
 '@gafus/chat-media-quality':'Chat2 and Mobile media player QA; direct Vitest sources exist but no package test script',
 '@gafus/error-handling':'Core/HTTP error contracts and boundary suite; no own tests',
 '@gafus/feature-flags-server':'Core appFeatureFlagsService.test.ts, API admin-feature-flags/public-mobile; no own tests',
 '@gafus/feed-cloud':'Cloud.ru/media offline suite and Worker; direct Vitest sources exist but no package test script',
 '@gafus/feed-storage':'CDN/MinIO media acceptance; one opt-in functional MinIO suite; no package test script',
 '@gafus/logger':'A2 OTLP/local telemetry contract and API/Worker trace; no own test script or own tests',
 '@gafus/queues':'Worker/BullMQ tests; direct Vitest queue suites exist but no package test script',
 '@gafus/ui-components':'Web/Mobile/Trainer/Admin mounted UI suites; no own tests'
};
const all=[];
for(const parent of ['apps','packages'])for(const dir of fs.readdirSync(path.join(root,parent)).sort()){
 const p=path.join(root,parent,dir,'package.json');if(!fs.existsSync(p))continue;
 const pkg=JSON.parse(fs.readFileSync(p,'utf8'));
 const name=pkg.name;const rel=`${parent}/${dir}`;
 const testFiles=[];
 function find(src){if(!fs.existsSync(src))return;for(const ent of fs.readdirSync(src,{withFileTypes:true})){
  if(ent.isDirectory()&&!['dist','build','node_modules','coverage','.turbo'].includes(ent.name))find(path.join(src,ent.name));
  else if(ent.isFile()&&/\.(test|spec)\.[cm]?[jt]sx?$/.test(ent.name))testFiles.push(path.relative(root,path.join(src,ent.name)).split(path.sep).join('/'));
 }}
 find(path.join(root,rel,'src'));testFiles.sort();
 let stage,gate,command,evidence;
 if(pkg.scripts?.test){
  if(mainPkgs.has(name)){stage='architecture';gate=`test-${name.slice(7)}`;}
  else if(name==='@gafus/web-vite'){stage='architecture';gate='web';}
  else if(mainApps.has(name)){stage='architecture';gate=`test-${name.slice(7)}`;}
  else {stage='extras';gate=`extra-${name.slice(7)}`;}
  command=stage==='architecture'?(gate==='web'?`node scripts/qa/web-vite-chunked-regression.mjs --run-id=<RUN_ID>`:`pnpm --filter ${name} test`):`pnpm --filter ${name} test`;
  evidence=stage==='architecture'?`<RUN_ID>/results.tsv:${gate}, ${gate}.log`:`<RUN_ID>/extras/results.json:${name}, extras/${name.slice(7)}-test.log`;
 }else{
  stage='no-test';gate=`no-test-${name.slice(7)}`;
  command=`pnpm --filter ${name} build`+(pkg.scripts?.typecheck?` && pnpm --filter ${name} typecheck`:'')+(pkg.scripts?.lint?` && pnpm --filter ${name} lint`:'')+(testFiles.length?` && pnpm exec vitest run --config vitest.config.ts ${testFiles.join(' ')} --maxWorkers=1 --fileParallelism=false`:'');
  evidence=`<RUN_ID>/no-test/results.json:${name} + per-command logs`;
 }
 all.push({name,dir:rel,testScript:pkg.scripts?.test||null,buildScript:pkg.scripts?.build||null,typecheckScript:pkg.scripts?.typecheck||null,lintScript:pkg.scripts?.lint||null,stage,gate,command,evidence,
  discoveredSourceTests:testFiles,consumerCoverage:consumer[name]||null,
  verification:pkg.scripts?.test?'DIRECT_TEST':'NO_TEST_SCRIPT',
  reasonExcludedFrom57:pkg.scripts?.test?null:(testFiles.length?'Missing package test script despite existing direct test files':'Missing package test script AND no discovered own test files; consumer/build only'),
  requiredResult:pkg.scripts?.test?'Exit 0, >0 executed tests, fresh log and no unreviewed SKIP':'Build exit 0; typecheck/lint where declared; every discovered test file executed directly; SKIP reviewed',
  prerequisite:stage==='architecture'?'Frozen integrated candidate, installed pnpm dependencies and reproducible root runner':stage==='extras'?'Fresh 33/33 architecture driver receipt and frozen code':'Fresh architecture + extras receipts, installed toolchain/ffmpeg; functional MinIO opt-in separately',
  concurrency:'EXCLUSIVE_UNTIL_COMPLETE'});
}
all.sort((a,b)=>a.name.localeCompare(b.name));
const testable=all.filter(x=>x.testScript);const noTest=all.filter(x=>!x.testScript);
const stages={architecture:all.filter(x=>x.stage==='architecture').length,extras:all.filter(x=>x.stage==='extras').length,'no-test':noTest.length};
const testsInNoTest=noTest.reduce((s,p)=>s+p.discoveredSourceTests.length,0);
if(all.length!==67||testable.length!==55||noTest.length!==12||stages.architecture!==26||stages.extras!==29||testsInNoTest!==38)throw Error('BASELINE_COUNT_MISMATCH '+JSON.stringify({all:all.length,testable:testable.length,noTest:noTest.length,stages,testsInNoTest}));
const matrix={schema:'gafus/postintegration-coverage/v1',builtAt:new Date().toISOString(),referenceRepo:root,source:'live package.json + scripts/qa/architecture-final-regression.sh + src tests discovery',counts:{workspace:all.length,directTests:testable.length,architecture:26,extras:29,withoutTestScript:noTest.length,withoutScriptButTests:noTest.filter(x=>x.discoveredSourceTests.length>0).length,orphanedSourceTestFiles:testsInNoTest,withoutScriptOrTests:noTest.filter(x=>!x.discoveredSourceTests.length).length},mainRunnerSha256:crypto.createHash('sha256').update(runner).digest('hex'),packages:all};
fs.writeFileSync(path.join(output,'coverage-matrix.json'),JSON.stringify(matrix,null,2)+'\n');
const lines=[
 '# Независимая матрица пост-интеграционной проверки 67 workspace-пакетов',
 '',
 `Сформировано: ${matrix.builtAt}. Источник: read-only инспекция ${root}. Этот снимок фиксирует **план**, не выполненные тесты. Сборка/тесты в ходе создания матрицы **не запускались**.`,
 '',
 '## Покрытие',
 '',
 `- 67 workspace: **55** с тестовым скриптом (26 в основном регрессионном runner, **29** в отдельной обязательной серии); **12** без test-скрипта.`,
 `- Среди 12 пакетов без test-скрипта **11 содержат 38 тестовых файлов**. Они не исключаются: для них требуется адресный direct Vitest запуск. **1** не содержит обнаруженных тестовых файлов; build и typecheck/contract-consumer не равнозначны собственным unit тестам.`,
 '- Матрица считается корректной только при точном соответствии текущим package.json, текущему architecture runner и списку тестовых файлов. Изменения пакетов после объединения => обновить и проверить матрицу, а не засчитывать старый список.',
 '- Статус теста **не** определяется историческими квитанциями: для будущей приёмки обязательна новая уникальная сессия, запуск стадий через локальный recorder и verification с frozen source state.',
 '',
 '## Все 55 пакетов с `test`',
 '',
 '| Пакет | Этап / gate | Команда | Квитанция |',
 '|---|---|---|---|',
];
for(const p of testable)lines.push(`| \`${p.name}\` | \`${p.stage}:${p.gate}\` | \`${p.command}\` | \`${p.evidence}\` |`);
lines.push('','## 12 пакетов без `test` — не исключать из итогового контроля','', '| Пакет | Обнаружено тестовых файлов | Причина неучастия в 55 | Обязательная альтернатива | Контракты потребителей |','|---|---:|---|---|---|');
for(const p of noTest){
 const why=p.discoveredSourceTests.length?'Нет `scripts.test`, хотя исходные тесты существуют; это пробел скриптов, не отсутствие тестов':'Нет `scripts.test` и исходных test/spec файлов; самостоятельное unit-покрытие отсутствует';
 let alt=`build`+(p.typecheckScript?', typecheck':'')+(p.lintScript?', lint':'')+(p.discoveredSourceTests.length?`, direct Vitest ${p.discoveredSourceTests.length} файлов`:'');
 lines.push(`| \`${p.name}\` | ${p.discoveredSourceTests.length} | ${why} | ${alt} | ${p.consumerCoverage} |`);
}
lines.push('','## Точные 38 найденных файлов без package test-скрипта','','Все перечисленные файлы должны учитываться адресным запуском, а не выпадать из матрицы.');
for(const p of noTest.filter(x=>x.discoveredSourceTests.length)){
 lines.push('',`**${p.name} (${p.discoveredSourceTests.length})**`,'',...p.discoveredSourceTests.map(x=>'- `'+x+'`'));
}
lines.push('','## Воспроизводимая последовательность для одного агента','','```bash','cd /Users/asmtv1/Desktop/gafus-refactor','CATALOG="$HOME/Library/Logs/gafus-refactor-regression/a3-coverage-catalog-20261112"','RUN_ID="postintcov-unique-001"','python3 "$CATALOG/coverage-gate.py" check','python3 "$CATALOG/coverage-gate.py" init --id="$RUN_ID"','python3 "$CATALOG/coverage-gate.py" architecture --id="$RUN_ID"','python3 "$CATALOG/coverage-gate.py" full-build --id="$RUN_ID"','python3 "$CATALOG/coverage-gate.py" extras --id="$RUN_ID"','python3 "$CATALOG/coverage-gate.py" no-test --id="$RUN_ID"','python3 "$CATALOG/coverage-gate.py" verify --id="$RUN_ID"','```','','**Эти команды являются планом для будущего объединения; сейчас ничего не запускалось.** Стартовый `init` должен создать новую папку, отсутствовавшую прежде. Старые `results.tsv` и completion.json из другого run ID не принимаются.','', '### Необходимые предпосылки и несовместимые запуски','','- Согласованный и замороженный исходный checkout, pnpm 10.12.4, Node, зависимости установлены. Потребуются PostgreSQL/Redis/MinIO только на отдельных A3/chaos/real-PG этапах, не в package-only проверке.','- `architecture` включает **принудительную сборку**, 33 gate, Web chunked, Mobile/Admin/Trainer, полный typecheck. **Не запускать параллельно** с `pnpm install`, Prisma generate, любыми Vitest/TypeScript/build и правками исходников.','- `extras` — ровно 29 прямых `pnpm --filter <pkg> test` последовательно; каждая квитанция содержит package, exit code, время и ссылку на лог.','- `no-test` — для всех 12 compile/build/typecheck, для 11 пакетов с тестовыми файлами — запуск **всех** файлов непосредственно через root Vitest config. Результат со skipped обязательно фиксируется; opt-in MinIO и ffmpeg могут ограничивать доказательство.','- Для `@gafus/feed-storage` `web4-functional-minio.acceptance.test.ts` без `WEB4_OWN_FUNCTIONAL_S3_TEST=1` штатно пропускается. Для `@gafus/cdn-upload` `clientVideoMp4.test.ts` пропускается без `ffmpeg`. Такие пропуски **не** закрывают соответствующий внешний/реальный сценарий.','- `verify` проверяет наличие исходной сессии, уникальный run ID, timestamp, 33 главных gate, по одной квитанции на каждый из 29 extras и всех 12 no-test, полный Web `completion.json`, совпадение snapshot и отсутствие пропусков без явного аудита.','- Gate из `a3-jobs-media-isolated-acceptance.sh`, `a3-merged-worker-dlq-acceptance.sh`, `architecture-chaos-local.sh`, A2 Observability и все 66 isolated-PG сценарии остаются **отдельными** обязательными разделами полной пост-интеграционной приёмки. Эта матрица не заменяет их и не утверждает внешний Cloud.ru/Beget PASS.','',
'## Инварианты / защита от ложного PASS','','1. **55/55** тестируемых пакетов приписаны ровно одному конкретному gate; главный архитектурный runner должен иметь 26 пакетов, остальные 29 только extras.','2. **12/12** пакетов без test-скрипта должны иметь собственные build/typecheck-квитанции, 11 из них дополнительно покрывают 38 исходных тестов.','3. Не принимать package-level `test PASS`, если запуск был не подтверждён в **текущей новой сессии** по неизменному snapshot.','4. Не принимать всего 33 архитектурных gate без driver exit-code и полного `results.tsv`; Web требует отдельный `completion.json` с учётом каждого найденного файла.','5. Тестовые пропуски — `SKIP_REVIEW_REQUIRED` до обоснованного решения; они не замещают недостающие unit-тесты у одного пакета.','6. Никаких общего дерева, merge, push, production, внешних сервисов или исторических квитанций при создании этого документа.','');
lines.push('','## Проверка и ревью пропущенных тестов','',
'Скрипт `coverage-gate.py verify` **запрещает безусловный PASS**, если Vitest/Web сообщил skipped. Нужна отдельная текущая approval-квитанция с точным runId, sourceDigest, обоснованием каждого skipped и подписью проверяющего. В противном случае вывод `SKIP_REVIEW_REQUIRED`, ненулевой exit и `a3-coverage-provisional.json`.',
'', 'Шаблон approval-файла (только после фактического прогона и чтения логов):',
'', '```json','{','  "sessionId": "<RUN_ID>",','  "sourceDigest": "<SHA256 FROM a3-coverage-session.json>",',
'  "approvedBy": "<РЕАЛЬНЫЙ проверяющий>",','  "accepted": [',
'    {"package": "@gafus/api", "skippedTests": 0, "skippedFiles": 0, "reason": "<Объяснить фактический пропуск и почему он допустим>"}',
'  ]','}','```',
'Количество и имена в `accepted` должны **в точности** совпасть с обнаруженными пропусками: образец 0/0 выше не является одобрением. Команда: `python3 "$CATALOG/coverage-gate.py" verify --id="$RUN_ID" --review-skips=<ПУТЬ_К_НОВОМУ_APPROVAL.json>`.',
'Даже после approval итог ограничен формулировкой `PACKAGE_COVERAGE_PASS_WITH_KNOWN_1_NO_UNIT_TEST_GAP`, а не «полная регрессия проекта».');
fs.writeFileSync(path.join(output,'coverage-matrix.md'),lines.join('\n'));
console.log('MATRIX_CREATED',output,JSON.stringify(matrix.counts));
