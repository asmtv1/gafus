import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {createRequire} from "node:module";
import {dirname,join} from "node:path";
import { bullTelemetryConfig, injectBullTelemetry } from "./telemetry-page.js";

const valid={
  GAFUS_BULL_BOARD_TELEMETRY_ENABLED:"true",
  GAFUS_TELEMETRY_ENVIRONMENT:"preview",
  GAFUS_BULL_BOARD_APP_VERSION:"1.7.3",
  GAFUS_RELEASE_SHA:"a".repeat(40),
};
const html='<!DOCTYPE html><html><head><title>Operator panel</title></head><body><script src="main.js"></script></body></html>';
test("Bull Board browser telemetry is off by default and leaves UI intact",()=>{
  assert.equal(bullTelemetryConfig({}),null);
  assert.equal(injectBullTelemetry(html,null),html);
  assert.equal(bullTelemetryConfig({...valid,GAFUS_BULL_BOARD_TELEMETRY_ENABLED:"false"}),null);
});
test("immutable, explicit preview release only",()=>{
  const configured=bullTelemetryConfig(valid);
  assert.deepEqual(configured,{
    enabled:true,service:"gafus-bull-board",appVersion:"1.7.3",build:"a".repeat(40),
  });
  const rendered=injectBullTelemetry(html,configured);
  assert.match(rendered, /<script id="gafus-browser-diagnostics-config" type="application\/json">/);
  assert.match(rendered,/src="\/admin\/queues\/gafus-diagnostics.js"/);
  assert.ok(rendered.includes('main.js'));
  assert.ok(!rendered.includes("uptrace-dsn"));
  assert.equal(rendered.match(/gafus-browser-diagnostics-config/g)?.length,1);
});
test("production cannot turn on without explicit approval",()=>{
  assert.throws(()=>bullTelemetryConfig({
    ...valid,GAFUS_TELEMETRY_ENVIRONMENT:"production",
  }),/BULL_TELEMETRY_PRODUCTION_DENIED/);
  assert.deepEqual(bullTelemetryConfig({
    ...valid,GAFUS_TELEMETRY_ENVIRONMENT:"production",
    GAFUS_TELEMETRY_PRODUCTION_APPROVED:"true",
  })?.service,"gafus-bull-board");
});
test("invalid/unsafe version and SHA never enter HTML",()=>{
  assert.throws(()=>bullTelemetryConfig({
    ...valid,GAFUS_RELEASE_SHA:'"</script><img src=x onerror=alert(1)>',
  }),/BULL_TELEMETRY_IMMUTABLE_RELEASE_REQUIRED/);
  assert.throws(()=>bullTelemetryConfig({
    ...valid,GAFUS_BULL_BOARD_APP_VERSION:"1.7.3-evil",
  }),/BULL_TELEMETRY_IMMUTABLE_RELEASE_REQUIRED/);
  assert.throws(()=>bullTelemetryConfig({
    ...valid,GAFUS_TELEMETRY_ENVIRONMENT:"development",
  }),/BULL_TELEMETRY_ENVIRONMENT_REQUIRED/);
});
test("upstream BullBoard EJS layout mismatch must fail closed",()=>{
  const configured=bullTelemetryConfig(valid)!;
  assert.throws(()=>injectBullTelemetry("<html><body>changed</body></html>",configured),
    /BULL_UI_INJECTION_SCHEMA_MISMATCH/);
  assert.throws(()=>injectBullTelemetry(html.replace("</head>","</head></head>"),configured),
    /BULL_UI_INJECTION_SCHEMA_MISMATCH/);
});
test("built browser bundle contains no upstream project credentials or source maps",()=>{
  const script=readFileSync(new URL("../dist/gafus-diagnostics.js",import.meta.url),"utf8");
  assert.ok(script.length>1000 && script.length<250_000);
  assert.doesNotMatch(script,/GAFUS_UPTRACE_INGEST_DSN|UPTRACE_DSN|sourceMappingURL|[0-9]{8}:[A-Za-z0-9_-]{30,}/);
});

test("injector is compatible with installed @bull-board/ui EJS, without modifying vendor files",()=>{
  const req=createRequire(import.meta.url);
  const fromApi=createRequire(req.resolve("@bull-board/api"));
  const fromExpress=createRequire(req.resolve("@bull-board/express"));
  const uiRoot=dirname(fromApi.resolve("@bull-board/ui/package.json"));
  const source=readFileSync(join(uiRoot,"dist","index.ejs"),"utf8");
  const ejs=fromExpress("ejs");
  const html=ejs.render(source,{
    basePath:"/admin/queues",title:"Bull Dashboard",
    favIconAlternative:"static/favicon-32x32.png",
    favIconDefault:"static/images/logo.svg",uiConfig:"{}",
  });
  const actual=injectBullTelemetry(html,bullTelemetryConfig(valid));
  assert.equal(actual.match(/gafus-browser-diagnostics-config/g)?.length,1);
  assert.equal(actual.match(/<script/g)?.length,(html.match(/<script/g)?.length??0)+2);
  assert.match(actual,/<div id="root">Loading/);
});
