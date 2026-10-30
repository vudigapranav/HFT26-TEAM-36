"""Candidate-side worker (UNTRUSTED container). Runs the candidate's code, nothing else.

This container holds only the candidate's files and this harness. It has no
tests, no expected outputs, no report path and no writable mount. Everything it
says is untrusted: the host validates every reply before forwarding it.

Requests (one JSON line on stdin):
  {"id": n, "op": "resolve", "module": "app.summary", "name": "peak_requests"}
  {"id": n, "op": "call", "module": "app.summary", "name": "peak_requests", "args": [...], "kwargs": [[k, v], ...]}
Replies (one JSON line on the protocol fd):
  {"id": n, "ok": true, "kind": "callable"} | {"id": n, "ok": true, "kind": "value", "value": ...}
  {"id": n, "ok": true, "value": ...}
  {"id": n, "ok": false, "error": {"type": "...", "message": "...", "where": "import|call|encode"}}
"""
import importlib
import os
import sys

sys.path.insert(0, "/harness")
import protocol  # noqa: E402  (trusted, read-only mount)

# Keep the real stdout for protocol replies; the candidate's prints go to stderr.
_proto = os.fdopen(os.dup(1), "w", buffering=1, encoding="utf-8")
os.dup2(2, 1)
sys.stdout = sys.stderr
_requests = sys.stdin
sys.stdin = open(os.devnull)  # candidate code can't read the request stream
sys.path.insert(1, "/work")  # candidate packages, after the harness

MAX_MESSAGE = 500


def reply(message):
    _proto.write(protocol.dumps(message) + "\n")
    _proto.flush()


def error(request_id, kind, exc, where):
    reply({"id": request_id, "ok": False, "error": {"type": kind, "message": str(exc)[:MAX_MESSAGE], "where": where}})


def load(name):
    try:
        return importlib.import_module(name), None
    except BaseException as exc:  # SyntaxError, sys.exit at import, anything
        return None, exc


def handle(request):
    request_id = request.get("id")
    module, exc = load(request.get("module", ""))
    if module is None:
        error(request_id, type(exc).__name__, exc, "import")
        return
    try:
        target = getattr(module, request.get("name", ""))
    except BaseException as exc:
        error(request_id, type(exc).__name__, exc, "import")
        return
    if request.get("op") == "resolve":
        if callable(target):
            reply({"id": request_id, "ok": True, "kind": "callable"})
            return
        try:
            reply({"id": request_id, "ok": True, "kind": "value", "value": protocol.encode(target)})
        except protocol.Unsupported as exc:
            error(request_id, "Unsupported", exc, "encode")
        return
    try:
        args = protocol.decode(request.get("args", []))
        kwargs = dict(protocol.decode(request.get("kwargs", {"__t": "dict", "v": []})))
    except BaseException as exc:
        error(request_id, "Unsupported", exc, "decode")
        return
    try:
        result = target(*args, **kwargs)
    except BaseException as exc:  # includes SystemExit raised by the candidate
        error(request_id, type(exc).__name__, exc, "call")
        return
    try:
        reply({"id": request_id, "ok": True, "value": protocol.encode(result)})
    except protocol.Unsupported as exc:
        error(request_id, "Unsupported", exc, "encode")


reply({"id": 0, "ok": True, "kind": "ready"})
for line in _requests:
    try:
        request = protocol.loads(line)
    except ValueError:
        break
    if not isinstance(request, dict):
        break
    handle(request)
