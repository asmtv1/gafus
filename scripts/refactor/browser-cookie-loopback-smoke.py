"""Local-only browser Secure/HttpOnly/SameSite cookie persistence smoke.
No DB, no credentials, no external network or product account involved.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os, subprocess, sys, threading, time

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
assert Path.cwd().resolve() == ROOT
CHROME = ROOT / 'apps/admin-panel/.ag4-w1-browser-hono-20261017/browsers/chrome/mac_arm-131.0.6778.204/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
assert CHROME.resolve().is_relative_to(ROOT) and CHROME.is_file()
PROFILE = ROOT / '.local-pg-scratch/auth-cookie-browser-smoke-profile'
assert PROFILE.resolve().is_relative_to(ROOT)
PROFILE.mkdir(mode=0o700, exist_ok=True)

class Api(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:5173')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Gafus-Auth-Transport')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def do_POST(self):
        self.send_response(200); self.cors()
        self.send_header('Set-Cookie', 'gafus_access=local_opaque; HttpOnly; Secure; SameSite=Lax; Path=/api/v1; Max-Age=900')
        self.send_header('Content-Type', 'application/json'); self.end_headers();self.wfile.write(b'{}')
    def do_GET(self):
        ok = 'gafus_access=local_opaque' in self.headers.get('Cookie', '')
        self.send_response(200); self.cors(); self.send_header('Content-Type','application/json'); self.end_headers()
        self.wfile.write(b'{"ok":true}' if ok else b'{"ok":false}')

class Browser(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_GET(self):
        content=b'''<!doctype html><html><head><title>COOKIE_TEST</title></head><body><main id="result">PENDING</main><script>
          (async()=>{ try {
           await fetch('http://127.0.0.1:3001/api/v1/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Gafus-Auth-Transport':'cookie'},body:'{}'});
           const r=await fetch('http://127.0.0.1:3001/api/v1/auth/me',{credentials:'include'});
           document.querySelector('main').textContent=(await r.json()).ok?'COOKIE_ACCEPTED':'COOKIE_NOT_PERSISTED';
          }catch(err){document.querySelector('main').textContent='COOKIE_FETCH_FAILED';}})();
          </script></body></html>'''
        self.send_response(200); self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content)

servers=[]
try:
    for port, handler in ((3001,Api),(5173,Browser)):
        server=ThreadingHTTPServer(('127.0.0.1',port),handler)
        servers.append(server)
        threading.Thread(target=server.serve_forever, daemon=True).start()
    args=[str(CHROME),'--headless=old','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--disable-background-networking','--disable-crash-reporter','--disable-extensions','--disable-sync','--disable-features=Crashpad','--no-proxy-server','--virtual-time-budget=7000',f'--user-data-dir={PROFILE}','--dump-dom','http://127.0.0.1:5173/']
    env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR')}
    env['HOME']=str(ROOT / '.local-pg-scratch')
    env['TMPDIR']=str(ROOT / '.local-pg-scratch') + '/'
    try:
        run=subprocess.run(args,env=env,capture_output=True,text=True,timeout=25)
    except subprocess.TimeoutExpired:
        print('LOOPBACK_BROWSER_COOKIE_RESULT=UNVERIFIED_CHROMIUM_TIMEOUT')
        sys.exit(77)
    result='COOKIE_ACCEPTED' if '>COOKIE_ACCEPTED</main>' in run.stdout else 'COOKIE_NOT_PERSISTED' if '>COOKIE_NOT_PERSISTED</main>' in run.stdout else 'COOKIE_FETCH_FAILED' if '>COOKIE_FETCH_FAILED</main>' in run.stdout else 'UNKNOWN'
    print('LOOPBACK_BROWSER_COOKIE_RESULT='+result)
    print('CHROME_EXIT='+str(run.returncode))
    if run.returncode or result!='COOKIE_ACCEPTED': sys.exit(1)
finally:
    for server in servers: server.shutdown();server.server_close()
