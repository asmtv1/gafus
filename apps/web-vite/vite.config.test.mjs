import { test } from "node:test";
import assert from "node:assert/strict";
import configFactory from "./vite.config.mjs";

test("Vite dev always targets local read-only mock API", () => {
  const prev = process.env.VITE_API_BASE_URL;
  try {
    delete process.env.VITE_API_BASE_URL;
    const config = configFactory({ command: "serve", mode: "development" });
    assert.equal(config.server.host, "127.0.0.1");
    assert.equal(config.server.proxy["/api/v1"].target, "http://127.0.0.1:4174");
    assert.equal(config.plugins, undefined);
  } finally {
    if (prev === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = prev;
  }
});
test("Vite dev refuses production API even if environment asks for it", () => {
  const prev = process.env.VITE_API_BASE_URL;
  try {
    process.env.VITE_API_BASE_URL = "https://api.gafus.ru";
    assert.throws(() => configFactory({ command: "serve", mode: "development" }), /local mock/);
  } finally {
    if (prev === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = prev;
  }
});
test("build is static and never configures runtime proxy or PWA", () => {
  const config = configFactory({ command: "build", mode: "production" });
  assert.equal(config.server.proxy, undefined);
  assert.equal(config.plugins, undefined);
});

test("production preview never inherits dev API proxy", () => {
  const previous = process.env.VITE_API_BASE_URL;
  try {
    process.env.VITE_API_BASE_URL = "https://api.gafus.ru";
    const config = configFactory({ command: "serve", mode: "production", isPreview: true });
    assert.equal(config.server.proxy, undefined);
    assert.deepEqual(config.preview.proxy, {});
    assert.equal(config.preview.host, "127.0.0.1");
  } finally {
    if (previous === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = previous;
  }
});

// COURSE030: explicit development-only connection to the isolated loopback Hono,
// keeping the original production/remote-URL rejector and mock default intact.
test("explicit local-Hono dev mode uses exact loopback port and keeps Origin unchanged", () => {
  const prevMode = process.env.GAFUS_WEB_DEV_API_MODE;
  const prevUrl = process.env.VITE_API_BASE_URL;
  try {
    delete process.env.VITE_API_BASE_URL;
    process.env.GAFUS_WEB_DEV_API_MODE = "local-hono";
    const config = configFactory({ command: "serve", mode: "development" });
    assert.equal(config.server.host, "127.0.0.1");
    assert.equal(config.server.port, 5173);
    assert.deepEqual(config.server.proxy["/api/v1"], {
      target: "http://127.0.0.1:3001", changeOrigin: false,
    });
    // Standard local-Hono must not forward album GETs to an absent 3601.
    assert.equal(config.server.proxy["/api/v1/gallery"], undefined);
    assert.equal(config.plugins, undefined);
  } finally {
    if (prevMode === undefined) delete process.env.GAFUS_WEB_DEV_API_MODE;
    else process.env.GAFUS_WEB_DEV_API_MODE = prevMode;
    if (prevUrl === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = prevUrl;
  }
});
test("unknown mode and requested external/local malicious VITE_API_BASE_URL fail closed", () => {
  const prevMode = process.env.GAFUS_WEB_DEV_API_MODE;
  const prevUrl = process.env.VITE_API_BASE_URL;
  try {
    for (const mode of ["real", "production", "localhost:3001", "local-hono?target=https://example.com"]) {
      process.env.GAFUS_WEB_DEV_API_MODE = mode;
      delete process.env.VITE_API_BASE_URL;
      assert.throws(() => configFactory({ command: "serve", mode: "development" }));
    }
    process.env.GAFUS_WEB_DEV_API_MODE = "local-hono";
    for (const candidate of ["https://api.gafus.ru", "http://127.0.0.1:3001", "http://localhost:4174", "http://127.0.0.1:4174@evil.example"]) {
      process.env.VITE_API_BASE_URL = candidate;
      assert.throws(() => configFactory({ command: "serve", mode: "development" }), /local mock/);
    }
  } finally {
    if (prevMode === undefined) delete process.env.GAFUS_WEB_DEV_API_MODE;
    else process.env.GAFUS_WEB_DEV_API_MODE = prevMode;
    if (prevUrl === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = prevUrl;
  }
});
test("mock remains unchanged and preview/build never inherit local-Hono proxy", () => {
  const prevMode = process.env.GAFUS_WEB_DEV_API_MODE;
  const prevUrl = process.env.VITE_API_BASE_URL;
  try {
    delete process.env.VITE_API_BASE_URL;
    process.env.GAFUS_WEB_DEV_API_MODE = "mock";
    const mock = configFactory({ command: "serve", mode: "development" });
    assert.equal(mock.server.proxy["/api/v1"].target, "http://127.0.0.1:4174");
    assert.equal(mock.server.proxy["/api/v1"].changeOrigin, true);
    process.env.GAFUS_WEB_DEV_API_MODE = "local-hono";
    for (const [command,preview] of [["build",false],["serve",true]]) {
      const config = configFactory({ command, mode: "production", isPreview: preview });
      assert.equal(config.server.proxy, undefined);
      assert.deepEqual(config.preview.proxy, {});
      assert.equal(config.plugins, undefined);
    }
  } finally {
    if (prevMode === undefined) delete process.env.GAFUS_WEB_DEV_API_MODE;
    else process.env.GAFUS_WEB_DEV_API_MODE = prevMode;
    if (prevUrl === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = prevUrl;
  }
});


test("isolated Gallery browser can use real Feed Hono without rerouting auth/gallery", () => {
  const saved = {
    GAFUS_WEB_DEV_API_MODE: process.env.GAFUS_WEB_DEV_API_MODE,
    GAFUS_WEB_GALLERY_FULL_HONO: process.env.GAFUS_WEB_GALLERY_FULL_HONO,
    VITE_API_BASE_URL: process.env.VITE_API_BASE_URL,
  };
  try {
    process.env.GAFUS_WEB_DEV_API_MODE = "local-hono";
    process.env.GAFUS_WEB_GALLERY_FULL_HONO = "1";
    delete process.env.VITE_API_BASE_URL;
    const config = configFactory({ command: "serve", mode: "development" });
    assert.equal(config.server.proxy["/api/v1"].target, "http://127.0.0.1:3601");
    assert.equal(config.server.proxy["/api/v1/gallery"].target, "http://127.0.0.1:3601");
    for (const route of ["/api/v1/feed", "/api/v1/feed-playback"]) {
      assert.deepEqual(config.server.proxy[route], {
        target: "http://127.0.0.1:3001", changeOrigin: false,
      });
    }
    assert.equal(config.server.proxy["/api/v1/auth"], undefined);
    const normal = configFactory({ command: "build", mode: "production" });
    assert.equal(normal.server.proxy, undefined);
  } finally {
    for (const [name,value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Questions QA explicitly isolates 5507 and full API 3002 without affecting 5173", () => {
  const saved = Object.fromEntries(["GAFUS_WEB_DEV_API_MODE", "GAFUS_QUESTIONS_ISOLATED_QA",
    "VITE_QUESTIONS_LOCAL_QA", "VITE_API_BASE_URL"].map(k => [k,process.env[k]]));
  try {
    delete process.env.VITE_API_BASE_URL;
    process.env.GAFUS_WEB_DEV_API_MODE = "local-hono";
    process.env.GAFUS_QUESTIONS_ISOLATED_QA = "1";
    process.env.VITE_QUESTIONS_LOCAL_QA = "1";
    const qa = configFactory({command:"serve",mode:"development"});
    assert.equal(qa.server.host,"127.0.0.1");
    assert.equal(qa.server.port,5507);
    assert.deepEqual(qa.server.proxy["/api/v1"],{
      target:"http://127.0.0.1:3002",changeOrigin:false,
    });
    assert.equal(qa.server.proxy["/api/v1/chats"],undefined);
    const preview=configFactory({command:"serve",mode:"production",isPreview:true});
    assert.equal(preview.server.proxy,undefined);
    process.env.GAFUS_WEB_DEV_API_MODE = "mock";
    assert.throws(()=>configFactory({command:"serve",mode:"development"}),
      /Unsafe isolated Questions QA/);
    process.env.GAFUS_WEB_DEV_API_MODE = "local-hono";
    delete process.env.VITE_QUESTIONS_LOCAL_QA;
    assert.throws(()=>configFactory({command:"serve",mode:"development"}),/Unsafe isolated Questions QA/);
  } finally {
    for(const [k,v] of Object.entries(saved)){
      if(v===undefined) delete process.env[k]; else process.env[k]=v;
    }
  }
});
