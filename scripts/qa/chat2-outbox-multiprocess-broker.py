"""Loopback fault proxy. Optional real Centrifugo upstream, never a remote endpoint."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.client import HTTPConnection
import json, sys, threading, socket

port, path, secret = int(sys.argv[1]), sys.argv[2], sys.argv[3]
upstream = int(sys.argv[4]) if len(sys.argv) == 5 else 0
lock = threading.Lock()
seen = set()
offsets = set()

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path not in ("/api/publish", "/api/info") or self.headers.get("X-API-Key") != secret:
            self.send_error(403)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        if upstream:
            connection = HTTPConnection("127.0.0.1", upstream, timeout=5)
            try:
                connection.request("POST", self.path, body, {
                    "Content-Type": "application/json", "X-API-Key": secret,
                })
                response = connection.getresponse()
                payload = response.read()
                status = response.status
            finally:
                connection.close()
        else:
            status, payload = 200, b'{"result":{}}'
        drop_ack = False
        if self.path == "/api/publish" and status == 200:
            request = json.loads(body)
            identity = request.get("data", {}).get("eventId")
            assert isinstance(identity, str) and identity.startswith("archqa-")
            ack = json.loads(payload)
            assert not ack.get("error"), "broker rejected synthetic event"
            with lock:
                first = identity not in seen
                seen.add(identity)
                # Real mode counts actual broker offsets, not simulated receiver dedup.
                offset = ack.get("result", {}).get("offset")
                if upstream:
                    assert isinstance(offset, int) and offset > 0
                    fresh = offset not in offsets
                    offsets.add(offset)
                else:
                    fresh = first
                with open(path, "a") as out:
                    out.write(json.dumps({"eventId": identity, "newEffect": fresh,
                                          "offset": offset}) + "\n")
                    out.flush()
                drop_ack = identity == "archqa-lost-ack" and first
        if drop_ack:
            # The upstream has accepted the publication. The Worker sees no HTTP ACK.
            self.close_connection = True
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()
            return
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *args):
        pass

ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
