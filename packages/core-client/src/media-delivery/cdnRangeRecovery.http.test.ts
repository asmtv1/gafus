import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import {
  probeCdnOutage, isSignedCdnFailoverActive, isTrustedCdnProbeUrl,
  MEDIA_CDN_OUTAGE_COOLDOWN_MS,
} from "./index";

// Strict local HTTP simulator: verifies status classification + byte Range
// transport and expiry/recovery. It is NOT an actual MinIO/S3 deployment.
const now = () => Math.floor(Date.now() / 1000);
const host = "quepraquiecebquomiel.begetcdn.cloud";
const signed = (expiry: number) => `https://${host}/media/v2/test1/v1/video/360.mp4?md5=ABCDEFGHIJKLMNOPQRSTUV&expires=${expiry}`;
const bytes = Buffer.from("0123456789abcdef", "ascii");
let upstream: Server;
let base = "";
let cdnStatus = 503;
beforeAll(async () => {
  upstream = createServer((req, res) => {
    if (req.url?.startsWith("/cdn")) {
      res.writeHead(cdnStatus, { "Cache-Control": "no-store" }); res.end(); return;
    }
    const url = new URL(req.url ?? "/", "http://local.invalid");
    if (url.pathname !== "/s3" || url.searchParams.get("sig") !== "synthetic-authorized" ||
        Number(url.searchParams.get("expires")) <= now()) {
      res.writeHead(403, { "Cache-Control": "private, no-store" }); res.end(); return;
    }
    const range = /^bytes=(\d+)-(\d+)?$/.exec(req.headers.range ?? "");
    const start = range ? Number(range[1]) : 0;
    const end = range ? Math.min(range[2] ? Number(range[2]) : bytes.length-1, bytes.length-1) : bytes.length-1;
    if (start >= bytes.length || end < start) {
      res.writeHead(416, { "Content-Range": `bytes */${bytes.length}` }); res.end(); return;
    }
    const chunk = bytes.subarray(start,end+1);
    res.writeHead(range ? 206 : 200, {
      "Accept-Ranges": "bytes", "Content-Range": range ? `bytes ${start}-${end}/${bytes.length}` : undefined,
      "Content-Length": chunk.length, "Cache-Control": "private, no-store",
    });
    res.end(chunk);
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  if (!address || typeof address === "string") throw Error("LOOPBACK_BIND_FAILED");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { if (upstream) await new Promise<void>(resolve => upstream.close(() => resolve())); });

describe("local HTTP simulated CDN -> private object Range/expiry/recovery", () => {
  it("5xx HEAD activates bounded circuit; authenticated ranged object yields exact 206", async () => {
    const url = signed(now()+180);
    cdnStatus = 503;
    const outage = await probeCdnOutage(url, { fetcher: (_,opts) => fetch(base+"/cdn",opts) });
    expect(outage).toBe(true);
    expect(isSignedCdnFailoverActive(url)).toBe(true);
    const resp = await fetch(`${base}/s3?sig=synthetic-authorized&expires=${now()+90}`,{
      headers:{ Range:"bytes=4-7" },
    });
    expect(resp.status).toBe(206);
    expect(resp.headers.get("content-range")).toBe("bytes 4-7/16");
    expect(resp.headers.get("accept-ranges")).toBe("bytes");
    expect(resp.headers.get("cache-control")).toBe("private, no-store");
    expect(await resp.text()).toBe("4567");
    const invalid=await fetch(`${base}/s3?sig=synthetic-authorized&expires=${now()+90}`,{
      headers:{Range:"bytes=100-"},
    });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */16");
  });
  it("expired or unsigned storage object refuses access; expired CDN probe URL rejected", async () => {
    for(const path of ["/s3",`/s3?sig=synthetic-authorized&expires=${now()-1}`]) {
      const response=await fetch(base+path);
      expect(response.status).toBe(403);
    }
    expect(isTrustedCdnProbeUrl(signed(now()-121),[host])).toBe(false);
  });
  it("CDN recovery after cooldown reselects CDN without storage grant", async () => {
    const url=signed(now()+180);
    cdnStatus=200;
    expect(await probeCdnOutage(url,{fetcher:(_,opts)=>fetch(base+"/cdn",opts)})).toBe(false);
    expect(isSignedCdnFailoverActive(url,Date.now()+MEDIA_CDN_OUTAGE_COOLDOWN_MS+500)).toBe(false);
  });
});
