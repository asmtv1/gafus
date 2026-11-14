"""Loopback-only fake Centrifugo API: records at-least-once publishes and idempotent effects."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json, sys, threading
port, path, secret = int(sys.argv[1]), sys.argv[2], sys.argv[3]
lock=threading.Lock()
seen=set()
class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path not in ("/api/publish", "/api/info") or self.headers.get("X-API-Key") != secret:
            self.send_error(403)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        if self.path == "/api/info":
            payload = b'{"result":{}}'
        else:
            request = json.loads(body)
            identity = request.get("data", {}).get("eventId")
            assert isinstance(identity, str) and identity.startswith("archqa-")
            with lock:
                fresh = identity not in seen
                seen.add(identity)
                with open(path, "a") as out:
                    out.write(json.dumps({"eventId":identity,"newEffect":fresh})+"\n")
                    out.flush()
            payload = b'{"result":{}}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *args): pass
ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()